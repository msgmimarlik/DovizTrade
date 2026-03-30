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

const messages = [];

let standardListings = [];
let arbitrageListings = [];

const wss = new WebSocketServer({ port: PORT });

// Track which users are currently connected: Map<socket, userId>
const connectedSockets = new Map();

const broadcast = (payload) => {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

const broadcastListingsSnapshot = () => {
  broadcast({ type: "listings:snapshot", standardListings, arbitrageListings });
};

const broadcastOnlineUsers = () => {
  // Build set of online userIds from connected sockets
  const onlineIds = new Set(connectedSockets.values());

  // Only expose approved/active non-admin users
  const onlineList = users
    .filter((u) => u.isActive && u.role !== "admin")
    .map((u) => ({
      id: String(u.id),
      name: u.name || u.username,
      avatar: (u.name || u.username || "?").split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase(),
      isOnline: onlineIds.has(u.id),
      officeName: u.officeName || null,
      location: u.location || null,
    }));

  broadcast({ type: "users:online", users: onlineList });
};

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "snapshot", messages, standardListings, arbitrageListings }));

  // Send current online users to the newly connected client
  const onlineIds = new Set(connectedSockets.values());
  const onlineList = users
    .filter((u) => u.isActive && u.role !== "admin")
    .map((u) => ({
      id: String(u.id),
      name: u.name || u.username,
      avatar: (u.name || u.username || "?").split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase(),
      isOnline: onlineIds.has(u.id),
      officeName: u.officeName || null,
      location: u.location || null,
    }));
  socket.send(JSON.stringify({ type: "users:online", users: onlineList }));

  socket.on("close", () => {
    const userId = connectedSockets.get(socket);
    connectedSockets.delete(socket);
    if (userId !== undefined) {
      broadcastOnlineUsers();
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
        const userId = Number(message.userId);
        if (userId && users.some((u) => u.id === userId && u.isActive)) {
          connectedSockets.set(socket, userId);
          broadcastOnlineUsers();
        }
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

        broadcast({ type: "listing:created", listing });
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
