import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

export interface CurrencyRate {
	name: string;
	symbol: string;
	buy: number;
	sell: number;
	change: number;
}

const DEFAULT_RATES: CurrencyRate[] = [
	{ name: "Dolar", symbol: "USD", buy: 38.42, sell: 38.55, change: 0.35 },
	{ name: "Euro", symbol: "EUR", buy: 41.18, sell: 41.34, change: -0.12 },
	{ name: "Sterlin", symbol: "GBP", buy: 48.76, sell: 48.95, change: 0.22 },
	{ name: "Gram Altin", symbol: "GAU", buy: 3842, sell: 3860, change: 1.15 },
	{ name: "22 Ayar Altin (Gram)", symbol: "G22", buy: 3520, sell: 3550, change: 0.6 },
	{ name: "Ceyrek Altin", symbol: "QAU", buy: 6350, sell: 6450, change: 0.85 },
	{ name: "Yarim Altin", symbol: "HAU", buy: 12700, sell: 12900, change: 0.9 },
	{ name: "Tam Altin", symbol: "TAU", buy: 25400, sell: 25800, change: 0.95 },
	{ name: "Gumus (Gram)", symbol: "XAG", buy: 32.1, sell: 32.6, change: -0.2 },
];

type TickerApiResponse = {
	rates?: CurrencyRate[];
	updatedAt?: string;
	source?: string;
	warning?: string;
};

type PersistedTickerData = {
	rates: CurrencyRate[];
	updatedAt: string | null;
	source: string | null;
};

const TICKER_STORAGE_KEY = "ticker:last-success";

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
	const [rates, setRates] = useState<CurrencyRate[]>(persisted?.rates ?? DEFAULT_RATES);
	const [updatedAt, setUpdatedAt] = useState<string | null>(persisted?.updatedAt ?? null);
	const [error, setError] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(persisted?.source ?? null);

	const load = useCallback(async () => {
		try {
			const response = await fetch(apiUrl("/api/market/ticker"), {
				headers: { Accept: "application/json" },
			});

			const rawBody = await response.text();
			let body: TickerApiResponse = {};
			try {
				body = (rawBody ? JSON.parse(rawBody) : {}) as TickerApiResponse;
			} catch {
				body = {};
			}

			let nextRates = rates;
			let nextUpdatedAt = updatedAt;
			let nextSource = source;

			if (Array.isArray(body.rates) && body.rates.length > 0) {
				nextRates = body.rates;
				setRates(body.rates);
			}

			if (body.updatedAt) {
				nextUpdatedAt = body.updatedAt;
				setUpdatedAt(body.updatedAt);
			}

			if (body.source) {
				nextSource = body.source;
				setSource(body.source);
			}

			if (Array.isArray(body.rates) && body.rates.length > 0) {
				writePersistedTicker({
					rates: nextRates,
					updatedAt: nextUpdatedAt,
					source: nextSource,
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
		}
	}, []);

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
		source,
	};
};

export default useTickerData;
