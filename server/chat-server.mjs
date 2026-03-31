import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateFilePath = path.join(__dirname, "chat-state.json");

const defaultUsers = [
  {
    id: 900004,
    name: "Murat Secmen",
    officeName: "DovizTrade Yonetim",
    username: "murat.admin",
    email: "muratsecmenn@gmail.com",
    password: "Murat-17",
    location: "Istanbul / Merkez",
    role: "admin",
    isActive: true,
  },
];

let registrationApplications = [];
let users = [...defaultUsers];

const saveState = async () => {
  const state = {
    registrationApplications,
    users,
  };
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
};

const loadState = async () => {
  try {
    const raw = await fs.readFile(stateFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    registrationApplications = Array.isArray(parsed.registrationApplications) ? parsed.registrationApplications : [];
    users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : [...defaultUsers];
  } catch {
    registrationApplications = [];
    users = [...defaultUsers];
    await saveState();
  }
};

await loadState();

const PORT = Number(process.env.CHAT_WS_PORT ?? 8787);
const INACTIVE_LISTING_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 2;

const messages = [];

let standardListings = [];
let arbitrageListings = [];

const wss = new WebSocketServer({ port: PORT });

// Track which users are currently connected: Map<socket, userId>
const connectedSockets = new Map();
// Track logical client session ids per socket: Map<socket, clientSessionId>
const connectedClientSessions = new Map();
// Track allocated session slots per user: Map<userId, Map<clientSessionId, slotNumber>>
const userSessionSlots = new Map();
// Tracks users whose browser tab is currently visible/active
const activeTabUserIds = new Set();
const inactiveListingTimeouts = new Map();
// Stores profile info for MySQL-auth users (not in local users array)
const connectedUserProfiles = new Map(); // userId -> { name, officeName, location, role }

const broadcast = (payload) => {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

const annotateListings = (list) => {
  const onlineIds = new Set(connectedSockets.values());
  return list.map((l) => ({
    ...l,
    ownerOnline: l.ownerId ? onlineIds.has(l.ownerId) : false,
    // Keep listings actionable for all clients even when owner tab is backgrounded.
    ownerTabActive: true,
  }));
};

const getSessionSlotMap = (userId) => {
  let slotMap = userSessionSlots.get(userId);
  if (!slotMap) {
    slotMap = new Map();
    userSessionSlots.set(userId, slotMap);
  }
  return slotMap;
};

const assignSessionSlot = (userId, clientSessionId) => {
  const slotMap = getSessionSlotMap(userId);

  if (slotMap.has(clientSessionId)) {
    return slotMap.get(clientSessionId);
  }

  if (slotMap.size >= MAX_SESSIONS_PER_USER) {
    return null;
  }

  const usedSlots = new Set(slotMap.values());
  let slotNumber = 1;
  while (usedSlots.has(slotNumber) && slotNumber <= MAX_SESSIONS_PER_USER) {
    slotNumber += 1;
  }

  if (slotNumber > MAX_SESSIONS_PER_USER) {
    return null;
  }

  slotMap.set(clientSessionId, slotNumber);
  return slotNumber;
};

const releaseSessionSlotIfUnused = (userId, clientSessionId) => {
  const stillUsed = [...connectedClientSessions.entries()].some(
    ([sock, sessionId]) => connectedSockets.get(sock) === userId && sessionId === clientSessionId,
  );

  if (stillUsed) {
    return;
  }

  const slotMap = userSessionSlots.get(userId);
  if (!slotMap) {
    return;
  }

  slotMap.delete(clientSessionId);
  if (slotMap.size === 0) {
    userSessionSlots.delete(userId);
  }
};

const broadcastListingsSnapshot = () => {
  broadcast({
    type: "listings:snapshot",
    standardListings: annotateListings(standardListings),
    arbitrageListings: annotateListings(arbitrageListings),
  });
};

const buildOnlineList = () => {
  const onlineIds = new Set(connectedSockets.values());

  // Start with users known to the WS server (non-admin, active)
  const wsUserIds = new Set();
  const list = [];

  const pushUserRows = (userId, displayName, officeName, location, isOnline) => {
    const slotMap = userSessionSlots.get(userId);
    const baseName = officeName || displayName || String(userId);

    if (isOnline && slotMap && slotMap.size > 0) {
      const orderedSlots = [...slotMap.values()].sort((a, b) => a - b);
      orderedSlots.forEach((slotNumber) => {
        const nameWithSlot = `${baseName} ${slotNumber}`;
        list.push({
          id: `${userId}:${slotNumber}`,
          name: nameWithSlot,
          avatar: nameWithSlot.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase(),
          isOnline: true,
          officeName: officeName || null,
          location: location || null,
        });
      });
      return;
    }

    const fallbackName = baseName;
    list.push({
      id: String(userId),
      name: fallbackName,
      avatar: fallbackName.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase(),
      isOnline,
      officeName: officeName || null,
      location: location || null,
    });
  };

  users
    .filter((u) => u.isActive && u.role !== "admin")
    .forEach((u) => {
      wsUserIds.add(u.id);
      pushUserRows(u.id, u.name || u.username, u.officeName, u.location, onlineIds.has(u.id));
    });

  // Add MySQL-auth users that are connected but not in WS users array
  for (const [userId, profile] of connectedUserProfiles.entries()) {
    if (wsUserIds.has(userId)) continue; // already included above
    if (profile.role === "admin") continue;
    pushUserRows(userId, profile.name || String(userId), profile.officeName, profile.location, onlineIds.has(userId));
  }

  return list;
};

const broadcastOnlineUsers = () => {
  broadcast({ type: "users:online", users: buildOnlineList() });
};

const clearInactiveListingTimeout = (userId) => {
  const timeoutId = inactiveListingTimeouts.get(userId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    inactiveListingTimeouts.delete(userId);
  }
};

const deleteListingsByOwner = (userId) => {
  const deletedIds = [
    ...standardListings.filter((listing) => listing.ownerId === userId).map((listing) => listing.id),
    ...arbitrageListings.filter((listing) => listing.ownerId === userId).map((listing) => listing.id),
  ];

  if (deletedIds.length === 0) {
    return;
  }

  standardListings = standardListings.filter((listing) => listing.ownerId !== userId);
  arbitrageListings = arbitrageListings.filter((listing) => listing.ownerId !== userId);
  deletedIds.forEach((id) => broadcast({ type: "listing:deleted", id }));
  broadcastListingsSnapshot();
};

const scheduleInactiveListingExpiry = (userId) => {
  if (!userId || inactiveListingTimeouts.has(userId)) {
    return;
  }

  const timeoutId = setTimeout(() => {
    inactiveListingTimeouts.delete(userId);
    deleteListingsByOwner(userId);
  }, INACTIVE_LISTING_TIMEOUT_MS);

  inactiveListingTimeouts.set(userId, timeoutId);
};

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "snapshot", messages, standardListings: annotateListings(standardListings), arbitrageListings: annotateListings(arbitrageListings) }));

  // Send current online users to the newly connected client
  socket.send(JSON.stringify({ type: "users:online", users: buildOnlineList() }));

  socket.on("close", () => {
    const userId = connectedSockets.get(socket);
    const clientSessionId = connectedClientSessions.get(socket);
    connectedSockets.delete(socket);
    connectedClientSessions.delete(socket);
    if (userId !== undefined) {
      activeTabUserIds.delete(userId);
      if (clientSessionId) {
        releaseSessionSlotIfUnused(userId, clientSessionId);
      }
      // Remove from profiles if no other socket is using this userId
      const stillConnected = [...connectedSockets.values()].some((id) => id === userId);
      if (!stillConnected) {
        // Do not remove listings immediately on transient disconnects (refresh/navigation).
        // Start the same 15-minute inactivity timeout used for background tabs.
        scheduleInactiveListingExpiry(userId);
      }
      broadcastOnlineUsers();
      broadcastListingsSnapshot();
    }
  });

  socket.on("message", async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString());

      const sendAdminData = () => {
        socket.send(JSON.stringify({
          type: "admin:data",
          pendingRegistrations: registrationApplications,
          users,
        }));
      };

      // Kullanıcı login
      if (message.type === "login") {
        const user = users.find(u => u.email.toLowerCase() === String(message.email).toLowerCase() && u.password === message.password);
        if (!user) {
          socket.send(JSON.stringify({ type: "login:error", error: "E-posta veya şifre hatalı." }));
        } else if (!user.isActive) {
          socket.send(JSON.stringify({ type: "login:error", error: "Hesabınız henüz yönetici tarafından onaylanmadı." }));
        } else {
          connectedSockets.set(socket, user.id);
          socket.send(JSON.stringify({ type: "login:success", user }));
          broadcastOnlineUsers();
        }
        return;
      }

      if (message.type === "user:online") {
        // Called by frontend when a user restores session from localStorage
        // Accept any numeric userId — auth is handled by the REST API (MySQL)
        const userId = Number(message.userId);
        const clientSessionId = String(message.clientSessionId || "").trim() || `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (userId) {
          const slot = assignSessionSlot(userId, clientSessionId);
          if (slot === null) {
            socket.send(JSON.stringify({ type: "user:online:rejected", error: "Kullanici zaten bagli." }));
            socket.close();
            return;
          }

          connectedSockets.set(socket, userId);
          connectedClientSessions.set(socket, clientSessionId);
          clearInactiveListingTimeout(userId);
          // Store profile info for users not in the local WS users array
          if (!connectedUserProfiles.has(userId)) {
            connectedUserProfiles.set(userId, {
              name: message.name || String(userId),
              officeName: message.officeName || null,
              location: message.location || null,
              role: message.role || "user",
            });
          }
          broadcastOnlineUsers();
          broadcastListingsSnapshot();
        }
        return;
      }

      if (message.type === "user:tab:active") {
        const userId = connectedSockets.get(socket);
        if (userId !== undefined) {
          activeTabUserIds.add(userId);
          clearInactiveListingTimeout(userId);
          broadcastListingsSnapshot();
        }
        return;
      }

      if (message.type === "user:tab:inactive") {
        const userId = connectedSockets.get(socket);
        if (userId !== undefined) {
          activeTabUserIds.delete(userId);
          scheduleInactiveListingExpiry(userId);
          broadcastListingsSnapshot();
        }
        return;
      }

      if (message.type === "user:logout") {
        const userId = Number(message.userId);
        if (!userId) return;

        const clientSessionId = connectedClientSessions.get(socket);
        connectedSockets.delete(socket);
        connectedClientSessions.delete(socket);
        activeTabUserIds.delete(userId);
        if (clientSessionId) {
          releaseSessionSlotIfUnused(userId, clientSessionId);
        }

        const stillConnected = [...connectedSockets.values()].some((id) => id === userId);
        if (!stillConnected) {
          connectedUserProfiles.delete(userId);
          // On explicit logout, do not remove listings immediately.
          // Start inactivity expiry timer so listings are removed after 15 minutes.
          clearInactiveListingTimeout(userId);
          scheduleInactiveListingExpiry(userId);
        }

        broadcastOnlineUsers();
        broadcastListingsSnapshot();
        return;
      }

      if (message.type === "register") {
        const email = String(message.email ?? "").trim().toLowerCase();
        if (!email) {
          socket.send(JSON.stringify({ type: "register:error", error: "E-posta gerekli." }));
          return;
        }

        const alreadyExists = users.some((u) => u.email.toLowerCase() === email);
        const alreadyPending = registrationApplications.some((u) => u.email.toLowerCase() === email);
        if (alreadyExists || alreadyPending) {
          socket.send(JSON.stringify({ type: "register:error", error: "Bu e-posta ile kayıtlı veya bekleyen bir başvuru var." }));
          return;
        }

        const application = {
          id: Number(message.id ?? Date.now()),
          officeName: String(message.officeName ?? ""),
          name: String(message.name ?? ""),
          username: String(message.username ?? "").toLowerCase(),
          email,
          phone: String(message.phone ?? ""),
          gsm: String(message.gsm ?? ""),
          city: String(message.city ?? ""),
          district: String(message.district ?? ""),
          address: String(message.address ?? ""),
          password: String(message.password ?? ""),
          createdAt: new Date().toISOString(),
        };

        registrationApplications.push(application);
        await saveState();
        socket.send(JSON.stringify({ type: "register:success" }));
        broadcast({ type: "admin:data", pendingRegistrations: registrationApplications, users });
        return;
      }

      if (message.type === "admin:approvals:get") {
        if (message.role !== "admin") return;
        sendAdminData();
        return;
      }

      if (message.type === "admin:approve") {
        if (message.role !== "admin") return;

        const applicationId = Number(message.applicationId);
        const index = registrationApplications.findIndex((a) => a.id === applicationId);
        if (index === -1) return;

        const application = registrationApplications[index];
        registrationApplications.splice(index, 1);

        const newUser = {
          id: application.id,
          name: application.name,
          officeName: application.officeName,
          username: application.username,
          email: application.email,
          password: application.password,
          phone: application.phone,
          gsm: application.gsm,
          city: application.city,
          district: application.district,
          address: application.address,
          location: `${application.city} / ${application.district}`,
          role: "user",
          isActive: true,
        };

        users.push(newUser);
        await saveState();
        broadcast({ type: "admin:data", pendingRegistrations: registrationApplications, users });
        return;
      }

      if (message.type === "admin:reject") {
        if (message.role !== "admin") return;

        const applicationId = Number(message.applicationId);
        registrationApplications = registrationApplications.filter((a) => a.id !== applicationId);
        await saveState();
        broadcast({ type: "admin:data", pendingRegistrations: registrationApplications, users });
        return;
      }

      if (message.type === "admin:user:set-active") {
        if (message.role !== "admin") return;

        const userId = Number(message.userId);
        const isActive = Boolean(message.isActive);
        users = users.map((u) => {
          if (u.id !== userId || u.role === "admin") return u;
          return { ...u, isActive };
        });
        await saveState();
        broadcast({ type: "admin:data", pendingRegistrations: registrationApplications, users });
        return;
      }

      if (message.type === "send") {
        const newMessage = {
          id: `g-${Date.now()}`,
          userName: message.userName ?? "Kullanici",
          avatar: message.avatar ?? "KU",
          text: String(message.text ?? "").trim(),
          time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        };

        if (!newMessage.text) return;
        messages.push(newMessage);
        broadcast({ type: "new", message: newMessage });
      }

      if (message.type === "delete") {
        if (message.role !== "admin") return;
        const index = messages.findIndex((item) => item.id === message.id);
        if (index === -1) return;
        messages.splice(index, 1);
        broadcast({ type: "deleted", id: message.id });
      }

      if (message.type === "listing:create") {
        const listing = message.listing;
        if (!listing || !listing.kind) return;

        if (listing.kind === "standard") {
          standardListings.push(listing);
        }

        if (listing.kind === "arbitrage") {
          arbitrageListings.push(listing);
        }

        broadcast({ type: "listing:created", listing: annotateListings([listing])[0] });
        broadcastListingsSnapshot();
      }

      if (message.type === "listing:delete") {
        const targetStandardListing = standardListings.find((item) => item.id === message.id);
        const targetArbitrageListing = arbitrageListings.find((item) => item.id === message.id);
        const targetListing = targetStandardListing || targetArbitrageListing;

        if (!targetListing) {
          return;
        }

        const isAdmin = message.role === "admin";
        const isOwner = message.requesterName && targetListing.userName === message.requesterName;
        if (!isAdmin && !isOwner) return;

        standardListings = standardListings.filter((item) => item.id !== message.id);
        arbitrageListings = arbitrageListings.filter((item) => item.id !== message.id);

        broadcast({ type: "listing:deleted", id: message.id });
        broadcastListingsSnapshot();
      }

      if (message.type === "chat:private") {
        const { toId, fromId, fromName, text, time } = message;
        if (!toId || !fromId || !text) return;
        connectedSockets.forEach((userId, sock) => {
          if (String(userId) === String(toId) && sock.readyState === sock.OPEN) {
            sock.send(JSON.stringify({ type: "chat:private", fromId: String(fromId), fromName, text, time }));
          }
        });
        return;
      }

      if (message.type === "transaction:start") {
        if (!message.actorName || !message.listingId) return;
        // Find in standard or arbitrage listings
        let updated = false;
        const txAmount = Number(message.transactionAmount);
        // Try standard listings
        for (let i = 0; i < standardListings.length; i++) {
          const l = standardListings[i];
          if (l.id === message.listingId) {
            if (l.isDivisible && txAmount > 0 && txAmount <= l.amount) {
              l.amount -= txAmount;
              if (l.amount <= 0) {
                standardListings.splice(i, 1);
              }
              updated = true;
            } else if (!l.isDivisible) {
              standardListings.splice(i, 1);
              updated = true;
            }
            break;
          }
        }
        // Try arbitrage listings
        for (let i = 0; i < arbitrageListings.length; i++) {
          const l = arbitrageListings[i];
          if (l.id === message.listingId) {
            if (l.isDivisible && txAmount > 0 && txAmount <= l.amount) {
              l.amount -= txAmount;
              if (l.amount <= 0) {
                arbitrageListings.splice(i, 1);
              }
              updated = true;
            } else if (!l.isDivisible) {
              arbitrageListings.splice(i, 1);
              updated = true;
            }
            break;
          }
        }
        broadcast({
          type: "transaction:started",
          actorName: message.actorName,
          listingId: message.listingId,
          listingLabel: message.listingLabel,
          ownerName: message.ownerName,
          transactionAmount: message.transactionAmount,
          actorInfo: message.actorInfo || null,
        });
        if (updated) {
          broadcastListingsSnapshot();
        }
      }
    } catch {
      // Ignore malformed messages from clients.
    }
  });
});

console.log(`General chat websocket server is running on ws://localhost:${PORT}`);
