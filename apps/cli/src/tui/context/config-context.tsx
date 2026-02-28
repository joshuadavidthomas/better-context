import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from 'react';
import { Effect } from 'effect';
import type { Repo } from '../types.ts';
import { services } from '../services.ts';

type ConfigState = {
	selectedModel: string;
	selectedProvider: string;
	setModel: (model: string) => void;
	setProvider: (provider: string) => void;
	repos: Repo[];
	addRepo: (repo: Repo) => void;
	removeRepo: (name: string) => void;
	loading: boolean;
};

const ConfigContext = createContext<ConfigState | null>(null);

export const useConfigContext = () => {
	const context = useContext(ConfigContext);
	if (!context) throw new Error('useConfigContext must be used within ConfigProvider');
	return context;
};

const fetchInitialConfig = async () => {
	const [reposList, modelConfig] = await Effect.runPromise(
		Effect.all([
			Effect.tryPromise(() => services.getRepos()),
			Effect.tryPromise(() => services.getModel())
		])
	);
	return { repos: reposList, provider: modelConfig.provider, model: modelConfig.model };
};

export const ConfigProvider = (props: { children: ReactNode }) => {
	const [selectedModel, setSelectedModel] = useState('');
	const [selectedProvider, setSelectedProvider] = useState('');
	const [repos, setRepos] = useState<Repo[]>([]);
	const [loading, setLoading] = useState(true);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		void (async () => {
			setLoading(true);
			const config = await fetchInitialConfig().catch(() => null);
			if (!mountedRef.current) return;
			if (config) {
				setSelectedModel(config.model);
				setSelectedProvider(config.provider);
				setRepos(config.repos);
			}
			setLoading(false);
		})();
	}, []);

	const addRepo = useCallback((repo: Repo) => setRepos((prev) => [...prev, repo]), []);
	const removeRepo = useCallback(
		(name: string) => setRepos((prev) => prev.filter((r) => r.name !== name)),
		[]
	);

	const state = useMemo<ConfigState>(
		() => ({
			selectedModel,
			selectedProvider,
			setModel: setSelectedModel,
			setProvider: setSelectedProvider,
			repos,
			addRepo,
			removeRepo,
			loading
		}),
		[selectedModel, selectedProvider, repos, addRepo, removeRepo, loading]
	);

	return <ConfigContext.Provider value={state}>{props.children}</ConfigContext.Provider>;
};
