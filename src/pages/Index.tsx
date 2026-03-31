import CurrencyTicker from "@/components/CurrencyTicker";
import Navbar from "@/components/Navbar";
import CurrencyFilter from "@/components/CurrencyFilter";

import ExchangeListingCard from "@/components/ExchangeListingCard";
import OnlineUsersPanel from "@/components/OnlineUsersPanel";
import ChatDialog from "@/components/ChatDialog";
import GeneralChat from "@/components/GeneralChat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { type OnlineUser } from "@/data/mockUsers";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";

const mockListings: any[] = [];
const mockArbitrageListings: any[] = [];

const sortByCurrencyAndRate = <T extends { currency: string; rate: number }>(
  listings: T[],
  rateOrder: "asc" | "desc",
) => {
  const currencyOrder = ["USD", "EUR", "GBP", "USDT", "GAU"];
  const getCurrencyPriority = (currency: string) => {
    const index = currencyOrder.indexOf(currency.toUpperCase());
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...listings].sort((a, b) => {
    const aPriority = getCurrencyPriority(a.currency);
    const bPriority = getCurrencyPriority(b.currency);

    if (aPriority !== bPriority) return aPriority - bPriority;

    const currencyCompare = a.currency.localeCompare(b.currency, "tr");
    if (currencyCompare !== 0) return currencyCompare;

    return rateOrder === "asc" ? a.rate - b.rate : b.rate - a.rate;
  });
};

type CurrentUser = {
  id: number;
  name?: string;
  role?: "admin" | "user";
  email?: string;
  officeName?: string;
  location?: string;
};

type TransactionStartedPayload = {
  type: "transaction:started";
  actorName: string;
  listingId: number;
  listingLabel?: string;
  ownerName?: string;
  transactionAmount?: number;
  actorInfo?: any;
};

const INACTIVE_TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika

const Index = () => {
  const navigate = useNavigate();
  const [chatUser, setChatUser] = useState<OnlineUser | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [standardListings, setStandardListings] = useState<any[]>(mockListings);
  const [arbitrageListings, setArbitrageListings] = useState<any[]>(mockArbitrageListings);
  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [transactionAmount, setTransactionAmount] = useState<string>("");
  const [transactionModal, setTransactionModal] = useState<null | { actorName: string; actorInfo?: any; listingId: number; listingLabel?: string; transactionAmount?: any }>(null);
  const [transactionMessage, setTransactionMessage] = useState<string>("");
  const listingsWsRef = useRef<WebSocket | null>(null);
  // Her ilan için kalan süreyi tutan state
  const [listingCountdowns, setListingCountdowns] = useState<{ [listingId: number]: number }>({});
  // Timer referansı
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const rawUser = sessionStorage.getItem("currentUser");
      setCurrentUser(rawUser ? JSON.parse(rawUser) : null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    const handleAppLogout = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: number }>;
      const userId = customEvent.detail?.userId;
      const ws = listingsWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && userId) {
        ws.send(JSON.stringify({ type: "user:logout", userId }));
      }
      setCurrentUser(null);
    };

    window.addEventListener("doviztrade:logout", handleAppLogout as EventListener);
    return () => {
      window.removeEventListener("doviztrade:logout", handleAppLogout as EventListener);
    };
  }, []);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const configuredWsUrl = import.meta.env.VITE_CHAT_WS_URL;
    const isLocalWsUrl = configuredWsUrl?.includes("localhost") || configuredWsUrl?.includes("127.0.0.1");
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const wsUrl = configuredWsUrl && (!isLocalWsUrl || isLocalHost)
      ? configuredWsUrl
      : `${wsProtocol}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    listingsWsRef.current = ws;

    ws.onopen = () => {
      // Announce presence so the server marks this user as online
      try {
        const rawUser = sessionStorage.getItem("currentUser");
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (u?.id) {
            ws.send(JSON.stringify({
              type: "user:online",
              userId: u.id,
              name: u.name || u.fullName || u.username || String(u.id),
              officeName: u.officeName || null,
              location: u.location || null,
              role: u.role || "user",
            }));
            ws.send(JSON.stringify({ type: document.hidden ? "user:tab:inactive" : "user:tab:active" }));
          }
        }
      } catch {
        // ignore
      }
    };


    // Geri sayım başlat/durdur mantığı
    const startCountdowns = () => {
      // Her ilan için kalan süreyi başlat
      setListingCountdowns((prev) => {
        const now = Date.now();
        const updated: { [listingId: number]: number } = {};
        [...standardListings, ...arbitrageListings].forEach((listing) => {
          // Eğer zaten başlatılmışsa, mevcut kalan süreyi koru
          updated[listing.id] = prev[listing.id] ?? INACTIVE_TIMEOUT_MS;
        });
        return updated;
      });
      if (!countdownIntervalRef.current) {
        countdownIntervalRef.current = setInterval(() => {
          setListingCountdowns((prev) => {
            const updated: { [listingId: number]: number } = {};
            Object.entries(prev).forEach(([id, ms]) => {
              updated[Number(id)] = ms - 1000;
            });
            return updated;
          });
        }, 1000);
      }
    };

    const stopCountdowns = () => {
      setListingCountdowns({});
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: document.hidden ? "user:tab:inactive" : "user:tab:active" }));
      }
      if (document.hidden) {
        startCountdowns();
      } else {
        stopCountdowns();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "snapshot"; standardListings?: any[]; arbitrageListings?: any[] }
          | { type: "listings:snapshot"; standardListings?: any[]; arbitrageListings?: any[] }
          | { type: "listing:created"; listing: any }
          | { type: "listing:deleted"; id: number }
          | { type: "users:online"; users: OnlineUser[] }
          | TransactionStartedPayload;

        if (payload.type === "snapshot") {
          if (payload.standardListings) setStandardListings(payload.standardListings);
          if (payload.arbitrageListings) setArbitrageListings(payload.arbitrageListings);
        }

        if (payload.type === "listings:snapshot") {
          if (payload.standardListings) setStandardListings(payload.standardListings);
          if (payload.arbitrageListings) setArbitrageListings(payload.arbitrageListings);
        }

        if (payload.type === "listing:created") {
          if (payload.listing.kind === "standard") {
            setStandardListings((prev) => [...prev, payload.listing]);
          }
          if (payload.listing.kind === "arbitrage") {
            setArbitrageListings((prev) => [...prev, payload.listing]);
          }
        }

        if (payload.type === "listing:deleted") {
          setStandardListings((prev) => prev.filter((item) => item.id !== payload.id));
          setArbitrageListings((prev) => prev.filter((item) => item.id !== payload.id));
        }

        if (payload.type === "users:online") {
          setOnlineUsers(payload.users);
        }

        if (payload.type === "transaction:started") {
          // Eğer mevcut kullanıcı ilan sahibi ise modal aç
          if (
            currentUser &&
            payload.ownerName &&
            (payload.ownerName === currentUser.name)
          ) {
            setTransactionModal({
              actorName: payload.actorName,
              listingId: payload.listingId,
              listingLabel: payload.listingLabel,
              transactionAmount: payload.transactionAmount,
              actorInfo: payload.actorInfo || null,
            });
          }
        }
      } catch {
        // Ignore malformed payload.
      }
    };

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopCountdowns();
      listingsWsRef.current = null;
      ws.close();
    };
    // Geri sayım tamamlandığında ilanı kaldır
    useEffect(() => {
      Object.entries(listingCountdowns).forEach(([id, ms]) => {
        if (ms <= 0) {
          // İlanı otomatik kaldır
          handleDeleteListing(Number(id));
          setListingCountdowns((prev) => {
            const updated = { ...prev };
            delete updated[id];
            return updated;
          });
        }
      });
    }, [listingCountdowns]);
  }, []);

  const sellListings = sortByCurrencyAndRate(standardListings.filter((l) => l.type === "sell"), "asc");
  const buyListings = sortByCurrencyAndRate(standardListings.filter((l) => l.type === "buy"), "desc");
  const sortedArbitrageListings = sortByCurrencyAndRate(arbitrageListings, "asc");

  const canDeleteListing = (listing: { userName?: string }) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return Boolean(currentUser.name && listing.userName === currentUser.name);
  };

  const handleDeleteListing = (listingId: number) => {
    if (!currentUser) return;

    const confirmed = window.confirm("İlanı kaldırmak istediğinizden emin misiniz?");
    if (!confirmed) {
      return;
    }

    const ws = listingsWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Ilan sunucusuna baglanilamadi.");
      return;
    }

    ws.send(JSON.stringify({ type: "listing:delete", id: listingId, role: currentUser.role, requesterName: currentUser.name }));
    setStandardListings((prev) => prev.filter((item) => item.id !== listingId));
    setArbitrageListings((prev) => prev.filter((item) => item.id !== listingId));
    toast.success("Ilan kaldirildi.");
  };

  const handleStartTransaction = (listing: any) => {
    setSelectedListing(listing);
    setTransactionMessage("");
  };


  const handleCompleteTransaction = () => {
    const listing = selectedListing;
    if (!listing || !currentUser) return;

    // Bölünebilir ise miktar kontrolü
    if (listing.isDivisible) {
      const maxAmount = Number(listing.amount);
      const enteredAmount = Number(transactionAmount);
      if (!enteredAmount || enteredAmount <= 0 || enteredAmount > maxAmount) {
        toast.error(`İşlem miktarı 1 ile ${maxAmount} arasında olmalı.`);
        return;
      }
    }

    const ws = listingsWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Ilan sunucusuna baglanilamadi.");
      return;
    }

    const listingLabel = listing.kind === "arbitrage"
      ? `${listing.currency} ${listing.amount}`
      : `${listing.currency} ${listing.amount} @ ${listing.rate}`;

    const finalAmount = listing.isDivisible ? Number(transactionAmount) : Number(listing.amount);
    const finalTotalTL = listing.rate ? Math.round(finalAmount * listing.rate) : 0;

    ws.send(
      JSON.stringify({
        type: "transaction:start",
        listingId: listing.id,
        actorName: currentUser.name || "Kullanici",
        ownerName: listing.userName,
        listingLabel,
        transactionAmount: finalAmount,
        actorInfo: {
          email: currentUser.email || null,
          officeName: currentUser.officeName || null,
          role: currentUser.role,
          location: currentUser.location || null,
        },
      }),
    );

    // Save to localStorage for transaction history
    try {
      const storageKey = `userTransactions_${currentUser.id}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const newTx = {
        id: Date.now(),
        type: listing.type === "sell" ? "buy" : "sell",
        currency: listing.currency,
        currencyFlag: listing.currencyFlag || "",
        amount: finalAmount,
        rate: listing.rate || 0,
        totalTL: finalTotalTL,
        counterparty: listing.userName,
        time: new Date().toLocaleString("tr-TR"),
      };
      localStorage.setItem(storageKey, JSON.stringify([newTx, ...existing].slice(0, 100)));
    } catch {
      // ignore storage errors
    }

    toast.success("Islem baslatildi.");
    setSelectedListing(null);
    setTransactionAmount("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full max-w-none px-0 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sol sabit piyasa kutusu */}
          <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 mb-8 lg:mb-0">
            <div className="sticky top-24">
              {!currentUser && (
                <div className="rounded-xl border border-border bg-card p-4 mb-4">
                  <h3 className="font-semibold text-foreground mb-2">Güncel ilanları görmek için giriş yapın</h3>
                  <p className="text-sm text-muted-foreground mb-3">Giriş sonrası alım, satım ve arbitraj ilanlarının tamamı görüntülenir.</p>
                  <Button onClick={() => navigate("/login")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Giriş Yap
                  </Button>
                </div>
              )}
              <div className="rounded-xl bg-card border border-border shadow p-4">
                <h3 className="font-bold text-lg mb-4 text-foreground">Piyasa Verileri</h3>
                <CurrencyTicker />
              </div>
            </div>
          </aside>
          {/* Listings */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold text-foreground">Güncel İlanlar</h2>
              <span className="text-sm text-muted-foreground">{currentUser ? `${standardListings.length + arbitrageListings.length} ilan` : "Giriş gerekli"}</span>
            </div>

            {currentUser ? (
              <>
            {/* Alım İlanları Tablosu */}
            <div className="mb-10">
              <h3 className="font-bold text-lg mb-2 text-green-700 text-left">Alım İlanları</h3>
              <div className="overflow-x-auto overflow-y-auto max-h-[430px] rounded-xl bg-green-50 dark:bg-[#1e2a23] transition-colors">
                <table className="min-w-full border text-sm">
                  <thead className="bg-green-50 dark:bg-[#233a2c] transition-colors">
                    <tr>
                      <th className="px-2 py-1 border text-left">Döviz</th>
                      <th className="px-2 py-1 border text-left">Miktar</th>
                      <th className="px-2 py-1 border text-left">Kur</th>
                      <th className="px-2 py-1 border text-left">İşlem Türü</th>
                        <th className="px-2 py-1 border text-left">Kullanıcı</th>
                        <th className="px-2 py-1 border text-left">Lokasyon</th>
                      <th className="px-2 py-1 border text-left">Süre</th>
                      <th className="px-2 py-1 border text-left">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyListings.map((listing) => (
                      <tr key={listing.id} className="border-b bg-green-100 dark:bg-[#233a2c] transition-colors">
                        <td className="px-2 py-1 border">{listing.currencyFlag} {listing.currency}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate} ₺</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                          <td className="px-2 py-1 border">
                            <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                              {listing.userName}
                            </span>
                          </td>
                          <td className="px-2 py-1 border">{listing.location}</td>
                        <td className="px-2 py-1 border">
                          {listingCountdowns[listing.id] !== undefined && document.hidden
                            ? `${Math.floor(listingCountdowns[listing.id] / 60000)}:${String(Math.floor((listingCountdowns[listing.id] % 60000) / 1000)).padStart(2, "0")}`
                            : listing.duration}
                        </td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={Boolean(listing.ownerOnline && !listing.ownerTabActive)}
                              onClick={() => handleStartTransaction(listing)}
                            >
                              İşlem Yap
                            </button>
                            {canDeleteListing(listing) && (
                              <button className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition" onClick={() => handleDeleteListing(listing.id)}>
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Satım İlanları Tablosu */}
            <div className="mb-10">
              <h3 className="font-bold text-lg mb-2 text-red-600 text-left">Satım İlanları</h3>
              <div className="overflow-x-auto overflow-y-auto max-h-[430px] rounded-xl bg-red-50 dark:bg-[#8B0000] transition-colors">
                <table className="min-w-full border text-sm">
                  <thead className="bg-red-50 dark:bg-[#8B0000] transition-colors">
                    <tr>
                      <th className="px-2 py-1 border text-left">Döviz</th>
                      <th className="px-2 py-1 border text-left">Miktar</th>
                      <th className="px-2 py-1 border text-left">Kur</th>
                      <th className="px-2 py-1 border text-left">İşlem Türü</th>
                        <th className="px-2 py-1 border text-left">Kullanıcı</th>
                        <th className="px-2 py-1 border text-left">Lokasyon</th>
                      <th className="px-2 py-1 border text-left">Süre</th>
                      <th className="px-2 py-1 border text-left">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellListings.map((listing) => (
                      <tr key={listing.id} className="border-b bg-red-100 dark:bg-[#8B0000] transition-colors">
                        <td className="px-2 py-1 border">{listing.currencyFlag} {listing.currency}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate} ₺</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                          <td className="px-2 py-1 border">
                            <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                              {listing.userName}{listing.ownerTabActive ? "" : listing.ownerOnline ? " 🟡" : ""}
                            </span>
                          </td>
                          <td className="px-2 py-1 border">{listing.location}</td>
                        <td className="px-2 py-1 border">
                          {listingCountdowns[listing.id] !== undefined && document.hidden
                            ? `${Math.floor(listingCountdowns[listing.id] / 60000)}:${String(Math.floor((listingCountdowns[listing.id] % 60000) / 1000)).padStart(2, "0")}`
                            : listing.duration}
                        </td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={Boolean(listing.ownerOnline && !listing.ownerTabActive)}
                              onClick={() => handleStartTransaction(listing)}
                            >
                              İşlem Yap
                            </button>
                            {canDeleteListing(listing) && (
                              <button className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition" onClick={() => handleDeleteListing(listing.id)}>
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Arbitraj İlanları Tablosu */}
            <div className="mb-10">
              <h3 className="font-bold text-lg mb-2 text-sky-600 text-left">Arbitraj İlanları</h3>
              <div className="overflow-x-auto overflow-y-auto max-h-[430px] rounded-xl bg-sky-50 dark:bg-[#16262f] transition-colors">
                <table className="min-w-full border text-sm">
                  <thead className="bg-sky-50 dark:bg-[#1a3340] transition-colors">
                    <tr>
                      <th className="px-2 py-1 border text-left">Döviz</th>
                      <th className="px-2 py-1 border text-left">Miktar</th>
                      <th className="px-2 py-1 border text-left">Kur</th>
                      <th className="px-2 py-1 border text-left">İşlem Türü</th>
                      <th className="px-2 py-1 border text-left">Kullanıcı</th>
                      <th className="px-2 py-1 border text-left">Lokasyon</th>
                      <th className="px-2 py-1 border text-left">Süre</th>
                      <th className="px-2 py-1 border text-left">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedArbitrageListings.map((listing) => (
                      <tr key={listing.id} className="border-b bg-sky-100 dark:bg-[#1a3340] transition-colors">
                        <td className="px-2 py-1 border">{listing.currencyFlag} {listing.currency}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate}</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                        <td className="px-2 py-1 border">
                          <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                            {listing.userName}
                          </span>
                        </td>
                        <td className="px-2 py-1 border">{listing.location}</td>
                        <td className="px-2 py-1 border">
                          {listingCountdowns[listing.id] !== undefined && document.hidden
                            ? `${Math.floor(listingCountdowns[listing.id] / 60000)}:${String(Math.floor((listingCountdowns[listing.id] % 60000) / 1000)).padStart(2, "0")}`
                            : listing.duration}
                        </td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              // ...buton her zaman aktif olacak
                              onClick={() => handleStartTransaction(listing)}
                            >
                              İşlem Yap
                            </button>
                            {canDeleteListing(listing) && (
                              <button className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition" onClick={() => handleDeleteListing(listing.id)}>
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              </>
            ) : null}
          </div>

          {/* Online Users Sidebar */}
          {currentUser && (
            <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 space-y-4">
              <div className="lg:sticky lg:top-20 space-y-4">
                <GeneralChat />
                <OnlineUsersPanel users={onlineUsers} onUserClick={setChatUser} />
              </div>
            </aside>
          )}
        </div>
      </main>

      <footer className="bg-card border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 DovizTrade. Tüm hakları saklıdır.</p>
        </div>
      </footer>

      {chatUser && <ChatDialog user={chatUser} onClose={() => setChatUser(null)} />}

      {/* İşlem başka kullanıcı tarafından başlatıldığında ilan sahibine modal */}
      <Dialog open={Boolean(transactionModal)} onOpenChange={(open) => { if (!open) setTransactionModal(null); }}>
        <DialogContent className="max-w-lg border-border bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>İlanınıza İşlem Başlatıldı</DialogTitle>
            <DialogDescription>
              İlanınıza başka bir kullanıcı tarafından işlem başlatıldı. İşlemi başlatan kullanıcının bilgileri aşağıdadır.
            </DialogDescription>
          </DialogHeader>
          {transactionModal && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <p><strong>İşlem Yapan:</strong> {transactionModal.actorName}</p>
                  {transactionModal.actorInfo && (
                    <>
                      {transactionModal.actorInfo.email && <p><strong>Email:</strong> {transactionModal.actorInfo.email}</p>}
                      {transactionModal.actorInfo.officeName && <p><strong>Ofis:</strong> {transactionModal.actorInfo.officeName}</p>}
                      {transactionModal.actorInfo.phone && <p><strong>Telefon:</strong> {transactionModal.actorInfo.phone}</p>}
                      {transactionModal.actorInfo.gsm && <p><strong>GSM:</strong> {transactionModal.actorInfo.gsm}</p>}
                      {transactionModal.actorInfo.role && <p><strong>Rol:</strong> {transactionModal.actorInfo.role}</p>}
                      {transactionModal.actorInfo.location && <p><strong>Lokasyon:</strong> {transactionModal.actorInfo.location}</p>}
                    </>
                  )}
                  <p><strong>İşlem:</strong> {transactionModal.listingLabel}</p>
                  {transactionModal.transactionAmount && (
                    <p><strong>Miktar:</strong> {transactionModal.transactionAmount}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setTransactionModal(null)} className="bg-primary text-primary-foreground hover:bg-primary/90">Kapat</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Kendi işlem başlatma modalı */}
      <Dialog open={Boolean(selectedListing)} onOpenChange={(open) => !open && setSelectedListing(null)}>
        <DialogContent className="max-w-2xl border-border bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>İşlem Detayı</DialogTitle>
            <DialogDescription>
              İşlemi başlatmak için miktar seçin ve onaylayın.
            </DialogDescription>
          </DialogHeader>

          {selectedListing && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <p><strong>Doviz:</strong> {selectedListing.currencyFlag} {selectedListing.currency}</p>
                  <p><strong>Kullanici:</strong> {selectedListing.userName}</p>
                  <p><strong>Miktar:</strong> {selectedListing.amount}</p>
                  <p><strong>Kur:</strong> {selectedListing.rate}</p>
                  <p><strong>Lokasyon:</strong> {selectedListing.location}</p>
                  <p><strong>Sure:</strong> {selectedListing.duration}</p>
                  <p className="md:col-span-2"><strong>İşlem Türü:</strong> {selectedListing.isBankTransfer ? "Bankadan" : "Elden"}</p>
                </div>
              </div>

              {selectedListing.isDivisible && (
                <div className="space-y-2">
                  <label className="font-medium">İşlem Miktarı</label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedListing.amount}
                    value={transactionAmount}
                    onChange={e => setTransactionAmount(e.target.value)}
                    placeholder={`1 - ${selectedListing.amount}`}
                  />
                  <div className="text-xs text-muted-foreground">En fazla {selectedListing.amount} {selectedListing.currency} seçebilirsiniz.</div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                İşlem başlatıldığında aktif kullanıcılara bildirim gidecek ve ilan sahibi ile fiziksel süreç için eşleşme başlatılacak.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedListing(null)}>
                  Vazgeç
                </Button>
                <Button onClick={handleCompleteTransaction} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  İşlemi Tamamla
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
