// In-memory registration and user storage
let registrationApplications = [];
let users = [
  {
    id: 900002,
    name: "Demo Kullanici",
    officeName: "Demo Ofis",
    username: "demo.kullanici",
    email: "demo@dovizcim.com",
    password: "Demo12345",
    location: "Istanbul / Merkez",
    role: "user",
    isActive: true,
  },
  {
    id: 900003,
    name: "Demo Kullanici 2",
    officeName: "Demo Ofis 2",
    username: "demo2.kullanici",
    email: "demo2@dovizcim.com",
    password: "Demo23456",
    location: "Ankara / Merkez",
    role: "user",
    isActive: true,
  },
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
import { WebSocketServer } from "ws";

const PORT = Number(process.env.CHAT_WS_PORT ?? 8787);

const messages = [
  { id: "g1", userName: "Ahmet K.", avatar: "AK", text: "Bugun dolar duser mi sizce?", time: "14:05" },
  { id: "g2", userName: "Elif Y.", avatar: "EY", text: "FED karari bekleniyor, ona gore hareket ederim.", time: "14:08" },
  { id: "g3", userName: "Mehmet S.", avatar: "MS", text: "Altin 3900'u gorur mu bu hafta?", time: "14:12" },
  { id: "g4", userName: "Fatma D.", avatar: "FD", text: "Sterlin almak isteyenler var mi? Iyi kurum var.", time: "14:18" },
  { id: "g5", userName: "Can B.", avatar: "CB", text: "Euro 41'in altina inerse aliciyim.", time: "14:22" },
  { id: "g6", userName: "Zeynep A.", avatar: "ZA", text: "Herkese iyi aksamlar", time: "14:30" },
];

const baseStandardListings = [
  { id: 1, kind: "standard", type: "sell", currency: "USD", currencyFlag: "🇺🇸", amount: 5000, rate: 38.5, totalTL: 192500, location: "Istanbul", duration: "30 dk", userName: "Ahmet K." },
  { id: 2, kind: "standard", type: "buy", currency: "EUR", currencyFlag: "🇪🇺", amount: 3000, rate: 41.2, totalTL: 123600, location: "Ankara", duration: "45 dk", userName: "Elif Y." },
  { id: 3, kind: "standard", type: "sell", currency: "GBP", currencyFlag: "🇬🇧", amount: 2000, rate: 48.8, totalTL: 97600, location: "Izmir", duration: "1 saat", userName: "Mehmet S." },
  { id: 4, kind: "standard", type: "buy", currency: "GAU", currencyFlag: "🥇", amount: 10, rate: 3845, totalTL: 38450, location: "Bursa", duration: "1 saat", userName: "Fatma D." },
  { id: 5, kind: "standard", type: "sell", currency: "USD", currencyFlag: "🇺🇸", amount: 10000, rate: 38.45, totalTL: 384500, location: "Antalya", duration: "2 saat", userName: "Can B." },
  { id: 6, kind: "standard", type: "buy", currency: "EUR", currencyFlag: "🇪🇺", amount: 7500, rate: 41.3, totalTL: 309750, location: "Istanbul", duration: "2 saat", userName: "Zeynep A." },
  { id: 7, kind: "standard", type: "sell", currency: "GAU", currencyFlag: "🥇", amount: 25, rate: 3850, totalTL: 96250, location: "Ankara", duration: "3 saat", userName: "Hasan T." },
  { id: 8, kind: "standard", type: "buy", currency: "USD", currencyFlag: "🇺🇸", amount: 20000, rate: 38.55, totalTL: 771000, location: "Konya", duration: "3 saat", userName: "Ali R." },
  { id: 9, kind: "standard", type: "sell", currency: "GBP", currencyFlag: "🇬🇧", amount: 1500, rate: 48.9, totalTL: 73350, location: "Istanbul", duration: "4 saat", userName: "Ayse M." },
  { id: 10, kind: "standard", type: "sell", currency: "USDT", currencyFlag: "🪙", amount: 12000, rate: 38.4, totalTL: 460800, location: "Istanbul", duration: "30 dk", userName: "Burak U." },
  { id: 11, kind: "standard", type: "buy", currency: "USDT", currencyFlag: "🪙", amount: 8000, rate: 38.45, totalTL: 307600, location: "Ankara", duration: "1 saat", userName: "Selin A." },
];

const baseArbitrageListings = [
  { id: 101, kind: "arbitrage", currency: "USD/EUR", currencyFlag: "🇺🇸/🇪🇺", amount: 12000, rate: 0.91, total: "10,920 EUR", userName: "Emre T.", location: "Berlin", duration: "2 saat" },
  { id: 102, kind: "arbitrage", currency: "EUR/GBP", currencyFlag: "🇪🇺/🇬🇧", amount: 8000, rate: 0.86, total: "6,880 GBP", userName: "Merve L.", location: "Londra", duration: "90 dk" },
  { id: 103, kind: "arbitrage", currency: "USDT/USD", currencyFlag: "🪙/🇺🇸", amount: 25000, rate: 1, total: "25,000 USD", userName: "Kerem A.", location: "Dubai", duration: "1 saat" },
  { id: 104, kind: "arbitrage", currency: "GBP/USD", currencyFlag: "🇬🇧/🇺🇸", amount: 5000, rate: 1.29, total: "6,450 USD", userName: "Derya N.", location: "Amsterdam", duration: "3 saat" },
];

const expandListings = (listings, targetCount, amountStep, idBase, totalBuilder) => [
  ...listings,
  ...Array.from({ length: Math.max(0, targetCount - listings.length) }, (_, i) => {
    const template = listings[i % listings.length];
    const amount = template.amount + (i + 1) * amountStep;
    return {
      ...template,
      id: idBase + i,
      amount,
      totalTL: template.totalTL !== undefined ? Math.round(amount * template.rate) : undefined,
      total: template.total !== undefined ? totalBuilder(template, amount) : undefined,
      userName: `${template.userName.split(" ")[0]} ${String.fromCharCode(65 + (i % 26))}.`,
    };
  }),
];

let standardListings = [
  ...expandListings(baseStandardListings.filter((item) => item.type === "sell"), 20, 75, 1000, () => undefined),
  ...expandListings(baseStandardListings.filter((item) => item.type === "buy"), 22, 95, 3000, () => undefined),
].sort((a, b) => a.id - b.id);

let arbitrageListings = expandListings(baseArbitrageListings, 16, 120, 2000, (template, amount) => {
  const [, quote] = template.currency.split("/");
  return `${(amount * template.rate).toLocaleString("tr-TR")} ${quote}`;
});

const wss = new WebSocketServer({ port: PORT });

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

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "snapshot", messages, standardListings, arbitrageListings }));

  socket.on("message", (rawData) => {
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
          socket.send(JSON.stringify({ type: "login:success", user }));
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
        broadcast({ type: "admin:data", pendingRegistrations: registrationApplications, users });
        return;
      }

      if (message.type === "admin:reject") {
        if (message.role !== "admin") return;

        const applicationId = Number(message.applicationId);
        registrationApplications = registrationApplications.filter((a) => a.id !== applicationId);
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
