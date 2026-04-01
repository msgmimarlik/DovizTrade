import { apiRequest, getClientSessionId } from "@/lib/network";
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
import { Check, Coins, DollarSign, Euro, PoundSterling, X } from "lucide-react";
import { toast } from "sonner";
import { resolveWsUrl } from "@/lib/network";

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
  phone?: string;
  gsm?: string;
};

type TransactionStartedPayload = {
  type: "transaction:started";
  viewerRole?: "owner" | "actor";
  targetUserId?: number;
  actorName: string;
  listingId: number;
  listingLabel?: string;
  ownerName?: string;
  transactionAmount?: number;
  counterpartyName?: string;
  counterpartyInfo?: any;
  ownerInfo?: any;
  actorInfo?: any;
  transactionType?: "buy" | "sell";
  currency?: string;
  currencyFlag?: string;
  rate?: number;
};

type TransactionModalState = {
  viewerRole: "owner" | "actor";
  counterpartName: string;
  counterpartInfo?: any;
  listingId: number;
  listingLabel?: string;
  transactionAmount?: number;
};

const INACTIVE_TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika

const sanitizeDisplayName = (name?: string) =>
  (name || "").replace(/[•●🟡]/g, "").replace(/\s+/g, " ").trim();

const appendUserTransaction = (
  userId: number,
  tx: {
    type: "buy" | "sell";
    currency: string;
    currencyFlag?: string;
    amount: number;
    rate: number;
    counterparty: string;
    counterpartyPhone?: string | null;
  },
) => {
  try {
    const storageKey = `userTransactions_${userId}`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const newTx = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: tx.type,
      currency: tx.currency,
      currencyFlag: tx.currencyFlag || "",
      amount: tx.amount,
      rate: tx.rate,
      counterparty: tx.counterparty,
      counterpartyPhone: tx.counterpartyPhone || null,
      time: new Date().toLocaleString("tr-TR"),
    };
    localStorage.setItem(storageKey, JSON.stringify([newTx, ...existing].slice(0, 100)));
  } catch {
    // ignore storage errors
  }
};

const getCurrencyIconElement = (currencyCode?: string) => {
  const iconClass = "h-4 w-4 inline-block align-middle";
  const code = (currencyCode || "").toUpperCase().trim();

  if (code === "USD") return <DollarSign className={iconClass} />;
  if (code === "EUR") return <Euro className={iconClass} />;
  if (code === "GBP") return <PoundSterling className={iconClass} />;
  return <Coins className={iconClass} />;
};

const renderCurrencyCell = (currency?: string) => {
  if (!currency) return null;

  if (currency.includes("/")) {
    const [base, quote] = currency.split("/").map((c) => c.trim());
    return (
      <span className="inline-flex items-center gap-1.5">
        {getCurrencyIconElement(base)}
        <span>{base}</span>
        <span>/</span>
        {getCurrencyIconElement(quote)}
        <span>{quote}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {getCurrencyIconElement(currency)}
      <span>{currency}</span>
    </span>
  );
};

const getListingDisplayName = (listing: { officeName?: string; userName?: string }) => {
  const officeName = sanitizeDisplayName(listing.officeName);
  if (officeName) return officeName;
  return sanitizeDisplayName(listing.userName);
};

const getDistrictOnly = (location?: string) => {
  if (!location) return "";
  const parts = location.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return parts[parts.length - 1];
};

const Index = () => {
  const navigate = useNavigate();
  const [chatUser, setChatUser] = useState<OnlineUser | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [standardListings, setStandardListings] = useState<any[]>(mockListings);
  const [arbitrageListings, setArbitrageListings] = useState<any[]>(mockArbitrageListings);
  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [transactionAmount, setTransactionAmount] = useState<string>("");
  const [transactionModal, setTransactionModal] = useState<TransactionModalState | null>(null);
  const [transactionMessage, setTransactionMessage] = useState<string>("");
  const listingsWsRef = useRef<WebSocket | null>(null);
  const currentUserRef = useRef<CurrentUser | null>(null);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
    const ws = new WebSocket(resolveWsUrl());
    listingsWsRef.current = ws;

    ws.onopen = () => {
      // Announce presence so the server marks this user as online
      try {
        const rawUser = sessionStorage.getItem("currentUser");
        if (rawUser) {
          const u = JSON.parse(rawUser);
          const clientSessionId = getClientSessionId(u?.id);
          if (u?.id) {
            ws.send(JSON.stringify({
              type: "user:online",
              userId: u.id,
              clientSessionId,
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
    const handleVisibility = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: document.hidden ? "user:tab:inactive" : "user:tab:active" }));
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
          | { type: "user:online:rejected"; error?: string }
          | TransactionStartedPayload;

        if (payload.type === "user:online:rejected") {
          toast.error(payload.error || "Kullanici zaten bagli.");
          sessionStorage.removeItem("currentUser");
          sessionStorage.removeItem("clientSessionId");
          setCurrentUser(null);
          navigate("/login");
          return;
        }

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
          const activeUser = currentUserRef.current;
          if (!activeUser) return;

          // New target-based payload (opens for both owner and actor)
          if (payload.targetUserId && Number(payload.targetUserId) === Number(activeUser.id)) {
            if (payload.transactionType && payload.currency && payload.transactionAmount) {
              appendUserTransaction(activeUser.id, {
                type: payload.transactionType,
                currency: payload.currency,
                currencyFlag: payload.currencyFlag || "",
                amount: Number(payload.transactionAmount),
                rate: Number(payload.rate || 0),
                counterparty: payload.counterpartyName || payload.actorName || payload.ownerName || "Karsi taraf",
                counterpartyPhone: payload.counterpartyInfo?.phone || payload.counterpartyInfo?.gsm || null,
              });
            }

            setTransactionModal({
              viewerRole: payload.viewerRole || "owner",
              counterpartName:
                payload.counterpartyName ||
                (payload.viewerRole === "actor" ? payload.ownerName || "Ilan Sahibi" : payload.actorName),
              counterpartInfo:
                payload.counterpartyInfo ||
                (payload.viewerRole === "actor" ? payload.ownerInfo || null : payload.actorInfo || null),
              listingId: payload.listingId,
              listingLabel: payload.listingLabel,
              transactionAmount: payload.transactionAmount,
            });
            return;
          }

          // Legacy fallback (owner side only)
          if (payload.ownerName && payload.ownerName === activeUser.name) {
            setTransactionModal({
              viewerRole: "owner",
              counterpartName: payload.actorName,
              counterpartInfo: payload.actorInfo || null,
              listingId: payload.listingId,
              listingLabel: payload.listingLabel,
              transactionAmount: payload.transactionAmount,
            });
          }
        }
      } catch {
        // Ignore malformed payload.
      }
    };

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      listingsWsRef.current = null;
      ws.close();
    };
  }, []);

  const sellListings = sortByCurrencyAndRate(standardListings.filter((l) => l.type === "sell"), "asc");
  const buyListings = sortByCurrencyAndRate(standardListings.filter((l) => l.type === "buy"), "desc");
  const sortedArbitrageListings = sortByCurrencyAndRate(arbitrageListings, "asc");

  const canDeleteListing = (listing: { userName?: string }) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return Boolean(currentUser.name && listing.userName === currentUser.name);
  };

  const canStartTransaction = (listing: { ownerId?: number; userName?: string }) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (listing.ownerId && listing.ownerId === currentUser.id) return false;
    return !(currentUser.name && listing.userName === currentUser.name);
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
    if (!canStartTransaction(listing)) {
      toast.error("Kendi ilaniniza islem yapamazsiniz.");
      return;
    }
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
          phone: currentUser.phone || null,
          gsm: currentUser.gsm || null,
          role: currentUser.role,
          location: currentUser.location || null,
        },
      }),
    );


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
                        <td className="px-2 py-1 border">{renderCurrencyCell(listing.currency)}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate} ₺</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                          <td className="px-2 py-1 border">
                            <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                              {getListingDisplayName(listing)}
                            </span>
                          </td>
                          <td className="px-2 py-1 border">{getDistrictOnly(listing.location)}</td>
                        <td className="px-2 py-1 border">{listing.duration}</td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canStartTransaction(listing)}
                              title={!canStartTransaction(listing) ? "Kendi ilaniniza islem yapamazsiniz." : undefined}
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
                        <td className="px-2 py-1 border">{renderCurrencyCell(listing.currency)}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate} ₺</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                          <td className="px-2 py-1 border">
                            <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                              {getListingDisplayName(listing)}
                            </span>
                          </td>
                          <td className="px-2 py-1 border">{getDistrictOnly(listing.location)}</td>
                        <td className="px-2 py-1 border">{listing.duration}</td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canStartTransaction(listing)}
                              title={!canStartTransaction(listing) ? "Kendi ilaniniza islem yapamazsiniz." : undefined}
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
                        <td className="px-2 py-1 border">{renderCurrencyCell(listing.currency)}</td>
                        <td className="px-2 py-1 border">{listing.amount}</td>
                        <td className="px-2 py-1 border">{listing.rate}</td>
                        <td className="px-2 py-1 border">{listing.isBankTransfer ? "Bankadan" : "Elden"}</td>
                        <td className="px-2 py-1 border">
                          <span className="flex items-center gap-1.5">
                              {/* Durum noktası kaldırıldı */}
                            {getListingDisplayName(listing)}
                          </span>
                        </td>
                        <td className="px-2 py-1 border">{getDistrictOnly(listing.location)}</td>
                        <td className="px-2 py-1 border">{listing.duration}</td>
                        <td className="px-2 py-1 border">
                          <div className="flex items-center gap-2">
                            <button
                              className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canStartTransaction(listing)}
                              title={!canStartTransaction(listing) ? "Kendi ilaniniza islem yapamazsiniz." : undefined}
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
          <DialogHeader className="text-center">
            <DialogTitle>
              {transactionModal?.viewerRole === "actor"
                ? "İşleminiz Karşı Tarafa İletildi"
                : "İlanınıza İşlem Uygulandı"}
            </DialogTitle>
          </DialogHeader>
          {transactionModal && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-100 px-3 py-2 text-green-800">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">İşlem onaylandı</span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <p>
                    <strong>{transactionModal.viewerRole === "actor" ? "Karşı Kullanıcı:" : "İşlem Yapan:"}</strong> {transactionModal.counterpartName}
                  </p>
                  {transactionModal.counterpartInfo && (
                    <>
                      {transactionModal.counterpartInfo.officeName && <p><strong>Büro:</strong> {transactionModal.counterpartInfo.officeName}</p>}
                      {transactionModal.counterpartInfo.phone && <p><strong>Telefon:</strong> {transactionModal.counterpartInfo.phone}</p>}
                      {transactionModal.counterpartInfo.email && <p><strong>Email:</strong> {transactionModal.counterpartInfo.email}</p>}
                      {transactionModal.counterpartInfo.location && <p><strong>Lokasyon:</strong> {transactionModal.counterpartInfo.location}</p>}
                    </>
                  )}
                  <p>
                    <strong>Kur:</strong>{" "}
                    {(() => {
                      const rawLabel = String(transactionModal.listingLabel || "");
                      const [leftPart, ratePart] = rawLabel.split("@").map((part) => part.trim());
                      const currency = (leftPart || "").split(" ")[0] || "-";
                      const rate = ratePart || "-";
                      return `${currency} - ${rate}`;
                    })()}
                  </p>
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
                  <p><strong>Doviz:</strong> {renderCurrencyCell(selectedListing.currency)}</p>
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
