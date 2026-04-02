import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

export interface CurrencyRate {
	name: string;
	symbol: string;
	buy: number;
	sell: number;
	change: number;
}

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
	const [rates, setRates] = useState<CurrencyRate[]>(persisted?.rates ?? []);
	const [updatedAt, setUpdatedAt] = useState<string | null>(persisted?.updatedAt ?? null);
	const [error, setError] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(persisted?.source ?? null);
	const [isLoading, setIsLoading] = useState(!persisted);

	const load = useCallback(async () => {
		setIsLoading((current) => (rates.length === 0 ? true : current));

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
