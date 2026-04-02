import { useCallback, useEffect, useState } from "react";

export interface CurrencyRate {
	name: string;
	symbol: string;
	buy: number;
	sell: number;
	change: number;
	upstreamBuy?: number | null;
	upstreamSell?: number | null;
	spread?: number | null;
}

type TickerApiResponse = {
	rates?: CurrencyRate[];
	updatedAt?: string;
	source?: string;
	upstreamSource?: string;
	warning?: string;
};

type PersistedTickerData = {
	rates: CurrencyRate[];
	updatedAt: string | null;
	source: string | null;
};

const TICKER_STORAGE_KEY = "ticker:last-success";
const TRUNCGIL_TICKER_URL = "https://finans.truncgil.com/today.json";

const parseTrNumber = (value: unknown) => {
	if (value === null || value === undefined) return null;
	if (typeof value === "number" && Number.isFinite(value)) return value;

	const raw = String(value)
		.replace(/%/g, "")
		.replace(/\s+/g, "")
		.trim();

	if (!raw) return null;

	let normalized = raw;

	if (raw.includes(",")) {
		normalized = raw.replace(/\./g, "").replace(/,/g, ".");
	} else {
		const dotCount = (raw.match(/\./g) || []).length;
		if (dotCount > 1) {
			const lastDotIndex = raw.lastIndexOf(".");
			normalized = `${raw.slice(0, lastDotIndex).replace(/\./g, "")}.${raw.slice(lastDotIndex + 1)}`;
		}
	}

	const numeric = Number(normalized);
	return Number.isFinite(numeric) ? numeric : null;
};

const parseUpdatedAt = (value: unknown) => {
	if (!value) return new Date().toISOString();
	const normalized = String(value).trim().replace(" ", "T");
	const date = new Date(`${normalized}+03:00`);
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const appendEurUsdParity = (rates: CurrencyRate[]) => {
	const usd = rates.find((rate) => rate.symbol === "USD");
	const eur = rates.find((rate) => rate.symbol === "EUR");

	if (!usd || !eur) return rates;

	const buy = Number((eur.buy / usd.sell).toFixed(6));
	const sell = Number((eur.sell / usd.buy).toFixed(6));
	if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
		return rates;
	}

	const parity: CurrencyRate = {
		name: "Eur/Usd",
		symbol: "EURUSD",
		buy,
		sell,
		change: 0,
	};

	const withoutExisting = rates.filter((rate) => rate.symbol !== "EURUSD");
	const eurIndex = withoutExisting.findIndex((rate) => rate.symbol === "EUR");
	if (eurIndex === -1) {
		return [...withoutExisting, parity];
	}

	return [
		...withoutExisting.slice(0, eurIndex + 1),
		parity,
		...withoutExisting.slice(eurIndex + 1),
	];
};

const normalizeDirectTickerPayload = (payload: Record<string, unknown>): TickerApiResponse => {
	const source = payload && typeof payload === "object" ? payload : {};

	const buildRate = (name: string, symbol: string, key: string): CurrencyRate | null => {
		const entry = source[key] as Record<string, unknown> | undefined;
		if (!entry || typeof entry !== "object") return null;

		const buy = parseTrNumber(entry.Alış ?? entry.Alis ?? entry.alis ?? entry.buy);
		const sell = parseTrNumber(entry.Satış ?? entry.Satis ?? entry.satis ?? entry.sell);
		const change = parseTrNumber(entry.Değişim ?? entry.Degisim ?? entry.degisim ?? entry.change ?? 0) ?? 0;
		const finalBuy = buy ?? sell;
		const finalSell = sell ?? buy;

		if (finalBuy === null || finalSell === null) {
			return null;
		}

		return {
			name,
			symbol,
			buy: Number(finalBuy),
			sell: Number(finalSell),
			change: Number(change),
		};
	};

	const rates = [
		buildRate("Dolar", "USD", "USD"),
		buildRate("Euro", "EUR", "EUR"),
		buildRate("Sterlin", "GBP", "GBP"),
		buildRate("Gram Altin", "GAU", "gram-altin"),
		buildRate("22 Ayar Altin (Gram)", "G22", "22-ayar-bilezik"),
		buildRate("Ceyrek Altin", "QAU", "ceyrek-altin"),
		buildRate("Yarim Altin", "HAU", "yarim-altin"),
		buildRate("Tam Altin", "TAU", "tam-altin"),
		buildRate("Gumus (Gram)", "XAG", "gumus"),
	].filter((rate): rate is CurrencyRate => Boolean(rate));

	return {
		rates: appendEurUsdParity(rates),
		updatedAt: parseUpdatedAt(source.Update_Date),
		source: "truncgil-direct",
		upstreamSource: "truncgil-direct",
	};
};

const readPersistedTicker = (): PersistedTickerData | null => {
	if (typeof window === "undefined") return null;

	try {
		const raw = window.localStorage.getItem(TICKER_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PersistedTickerData>;
		if (!Array.isArray(parsed.rates) || parsed.rates.length === 0) return null;

		return {
			rates: parsed.rates as CurrencyRate[],
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
			source: typeof parsed.source === "string" ? parsed.source : null,
		};
	} catch {
		return null;
	}
};

const writePersistedTicker = (data: PersistedTickerData) => {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(TICKER_STORAGE_KEY, JSON.stringify(data));
	} catch {
		// Storage errors should not block ticker rendering.
	}
};

const useTickerData = () => {
	const persisted = readPersistedTicker();
	const [rates, setRates] = useState<CurrencyRate[]>(persisted?.rates ?? []);
	const [updatedAt, setUpdatedAt] = useState<string | null>(persisted?.updatedAt ?? null);
	const [error, setError] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(persisted?.source ?? null);
	const [isLoading, setIsLoading] = useState(!persisted);

	const load = useCallback(async () => {
		setIsLoading((current) => (rates.length === 0 ? true : current));

		try {
			const response = await fetch(`${TRUNCGIL_TICKER_URL}?ts=${Date.now()}`, {
				headers: { Accept: "application/json" },
			});

			const rawBody = await response.json();
			const body = normalizeDirectTickerPayload(rawBody as Record<string, unknown>);

			if (Array.isArray(body.rates) && body.rates.length > 0) {
				setRates(body.rates);
			}

			if (body.updatedAt) {
				setUpdatedAt(body.updatedAt);
			}

			if (body.source) {
				setSource(body.source);
			}

			if (Array.isArray(body.rates) && body.rates.length > 0) {
				writePersistedTicker({
					rates: body.rates,
					updatedAt: body.updatedAt ?? null,
					source: body.source ?? null,
				});
			}

			if (!response.ok && !Array.isArray(body.rates)) {
				setError(`Ticker API HTTP ${response.status}`);
			} else if (body.warning) {
				setError(body.warning);
			} else {
				setError(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Ticker verisi alinamadi");
		} finally {
			setIsLoading(false);
		}
	}, [rates.length]);

	useEffect(() => {
		void load();
		const timer = window.setInterval(() => {
			void load();
		}, 10000);
		return () => {
			window.clearInterval(timer);
		};
	}, [load]);

	return {
		rates,
		updatedAt,
		error,
		isLoading,
		source,
	};
};

export default useTickerData;
