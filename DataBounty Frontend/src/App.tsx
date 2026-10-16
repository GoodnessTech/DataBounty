import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, BarChart3, Check, ChevronDown, ChevronRight, Circle,
  ClipboardList, Cloud, Database, FileJson, Filter, Globe2, Layers3, Menu, Plus,
  Search, ShieldCheck, TrendingUp, UploadCloud, Wallet, X, Zap, ExternalLink, AlertCircle
} from 'lucide-react';
import { ethers } from 'ethers';
import { BOT_CHAIN_CONFIG } from './config/chain';
import {
  connectBrowserWallet,
  switchToBotChain,
  fetchBuyerCredits,
  fetchProviderProceeds,
  purchaseCreditsOnchain,
  settleUsageOnchain,
  registerProductOnchain,
  withdrawProviderProceedsOnchain,
  WalletState,
} from './services/contractService';
import { generateUsageReceipt, toProductIdBytes32, CanonicalReceipt } from './services/receiptService';

export type Product = {
  id: string;
  name: string;
  provider: string;
  providerAddress?: string;
  description: string;
  category: string;
  type: 'Dataset' | 'API' | 'Live feed';
  pricing: 'Subscription' | 'Access credits' | 'Usage-based';
  price: string; // in BOT
  priceWei?: bigint;
  unit?: string;
  accent: string;
  tag: string;
  verified?: boolean;
  onchainVerified?: boolean;
  fields: string[];
};

export type ActivityItem = {
  id: string;
  type: 'Deployment' | 'Registration' | 'Purchase' | 'Settlement' | 'Withdrawal';
  title: string;
  detail: string;
  txHash: string;
  blockNumber?: number;
  timestamp: string;
};

const initialProducts: Product[] = [
  {
    id: 'climate-grid',
    name: 'Climate Grid Signals',
    provider: 'Aster Labs',
    providerAddress: '0x34a19B30d9edD62424802d323E81c25599A9f02e',
    description: 'Normalized climate observations and anomaly indicators for research, risk, and model training.',
    category: 'Climate and Environment',
    type: 'Dataset',
    pricing: 'Access credits',
    price: '0.0001',
    priceWei: ethers.parseEther('0.0001'),
    unit: 'credit',
    accent: 'ice',
    tag: 'CLIMATE',
    verified: true,
    onchainVerified: true,
    fields: ['timestamp', 'lat / lon', 'temperature_anomaly', 'precipitation_index']
  },
  {
    id: 'market-depth',
    name: 'Market Depth API',
    provider: 'Northstar Data',
    description: 'Low-latency order book snapshots across spot markets, delivered through a clean REST API.',
    category: 'Finance and Markets',
    type: 'API',
    pricing: 'Usage-based',
    price: '0.0002',
    priceWei: ethers.parseEther('0.0002'),
    unit: 'request',
    accent: 'red',
    tag: 'MARKETS',
    verified: true,
    fields: ['symbol', 'bid_depth', 'ask_depth', 'spread_bps']
  },
  {
    id: 'transit-pulse',
    name: 'Transit Pulse',
    provider: 'Civic Signal',
    description: 'Real-time public transit movement, delay, and route coverage data for 42 metro systems.',
    category: 'Public Data',
    type: 'Live feed',
    pricing: 'Access credits',
    price: '0.0005',
    priceWei: ethers.parseEther('0.0005'),
    unit: 'credit',
    accent: 'lime',
    tag: 'PUBLIC',
    fields: ['route_id', 'vehicle_position', 'delay_seconds', 'occupancy_band']
  },
  {
    id: 'model-evals',
    name: 'Model Evals Corpus',
    provider: 'Benchline',
    description: 'Curated benchmark prompts, human preference labels, and evaluation traces for language models.',
    category: 'AI and Machine Learning',
    type: 'Dataset',
    pricing: 'Access credits',
    price: '0.001',
    priceWei: ethers.parseEther('0.001'),
    unit: 'credit',
    accent: 'warm',
    tag: 'AI / ML',
    verified: true,
    fields: ['prompt_hash', 'task_family', 'label', 'confidence']
  },
  {
    id: 'genome-index',
    name: 'Genome Index',
    provider: 'Helix Research',
    description: 'A structured index of public genomic studies with provenance and machine-readable metadata.',
    category: 'Research and Science',
    type: 'Dataset',
    pricing: 'Access credits',
    price: '0.0008',
    priceWei: ethers.parseEther('0.0008'),
    unit: 'credit',
    accent: 'blue',
    tag: 'RESEARCH',
    fields: ['study_id', 'organism', 'sample_count', 'publication_date']
  },
  {
    id: 'repo-activity',
    name: 'Open Source Pulse',
    provider: 'Codebase One',
    description: 'Repository activity signals for engineering intelligence, ecosystem research, and discovery.',
    category: 'Developer APIs',
    type: 'API',
    pricing: 'Usage-based',
    price: '0.0001',
    priceWei: ethers.parseEther('0.0001'),
    unit: 'request',
    accent: 'silver',
    tag: 'DEV',
    fields: ['repo_id', 'event_type', 'actor_hash', 'language']
  },
];

const initialActivities: ActivityItem[] = [
  {
    id: 'act-init-1',
    type: 'Deployment',
    title: 'DataBountyCore Mainnet Contract Deployed',
    detail: 'Deployed to BOT Chain Mainnet with 2.50% protocol fee and reentrancy protection',
    txHash: BOT_CHAIN_CONFIG.deploymentTxHash,
    blockNumber: BOT_CHAIN_CONFIG.deploymentBlock,
    timestamp: 'Just now',
  },
  {
    id: 'act-init-2',
    type: 'Registration',
    title: 'Climate Grid Signals Registered Onchain',
    detail: 'Product ID climate-grid registered at 0.0001 BOT / credit',
    txHash: '0xeb9d71e29dd3d274f033ebfa426b6c57345ffbab63853817a985a02293713d47',
    blockNumber: 26870800,
    timestamp: 'Just now',
  },
];

const categories = ['All products', 'AI and Machine Learning', 'Finance and Markets', 'Climate and Environment', 'Research and Science', 'Public Data', 'Developer APIs', 'Other'];
const navItems = [['Marketplace', '/marketplace'], ['For Providers', '/provider'], ['How It Works', '/#how'], ['Analytics', '/analytics'], ['Documentation', '/#docs']];

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [walletOpen, setWalletOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [productsList, setProductsList] = useState<Product[]>(initialProducts);
  const [activities, setActivities] = useState<ActivityItem[]>(initialActivities);

  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isCorrectChain: false,
    balanceBOT: '0.0',
  });

  const navigate = (to: string) => {
    const [route, hash] = to.split('#');
    if (route !== window.location.pathname) window.history.pushState({}, '', route || '/');
    setPath(route || '/'); setMobileOpen(false);
    if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 20);
  };

  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 4500); };

  // Listen to provider events if wallet is available
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          handleConnectWallet();
        } else {
          setWallet({ address: null, chainId: null, isCorrectChain: false, balanceBOT: '0.0' });
        }
      };

      const handleChainChanged = () => {
        handleConnectWallet();
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (ethereum.removeListener) {
          ethereum.removeListener('accountsChanged', handleAccountsChanged);
          ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  const handleConnectWallet = async () => {
    try {
      const res = await connectBrowserWallet();
      setWallet(res);
      notify(`Wallet connected: ${res.address.slice(0, 6)}…${res.address.slice(-4)}`);
      setWalletOpen(false);
    } catch (err: any) {
      notify(err.message || 'Failed to connect wallet');
    }
  };

  const handleSwitchNetwork = async () => {
    try {
      await switchToBotChain();
      await handleConnectWallet();
      notify('Switched to BOT Chain Mainnet');
    } catch (err: any) {
      notify(err.message || 'Failed to switch network');
    }
  };

  const handleAddActivity = (item: ActivityItem) => {
    setActivities(prev => [item, ...prev]);
  };

  const handleAddProduct = (newProd: Product) => {
    setProductsList(prev => [newProd, ...prev]);
  };

  return (
    <div className="app-shell">
      <Header
        path={path}
        navigate={navigate}
        wallet={wallet}
        onWallet={() => setWalletOpen(true)}
        onSwitchChain={handleSwitchNetwork}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {wallet.address && !wallet.isCorrectChain && (
        <div className="page-pad">
          <div className="network-warning-bar">
            <span>
              <AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              You are connected to an unsupported network (Chain ID: {wallet.chainId}). Please switch to <strong>BOT Chain Mainnet (677)</strong>.
            </span>
            <button className="button button-light" style={{ padding: '6px 12px', fontSize: 11 }} onClick={handleSwitchNetwork}>
              Switch Network
            </button>
          </div>
        </div>
      )}

      <main>
        {path === '/' ? (
          <Landing navigate={navigate} products={productsList} />
        ) : path === '/marketplace' ? (
          <Marketplace navigate={navigate} products={productsList} />
        ) : path.startsWith('/marketplace/') ? (
          <ProductDetail
            id={path.split('/').pop() || ''}
            products={productsList}
            wallet={wallet}
            navigate={navigate}
            notify={notify}
            onActivity={handleAddActivity}
            onConnect={() => setWalletOpen(true)}
          />
        ) : path === '/provider' ? (
          <Provider
            navigate={navigate}
            wallet={wallet}
            products={productsList}
            notify={notify}
            onActivity={handleAddActivity}
            onConnect={() => setWalletOpen(true)}
          />
        ) : path === '/buyer' ? (
          <Buyer
            navigate={navigate}
            wallet={wallet}
            products={productsList}
            activities={activities}
            onConnect={() => setWalletOpen(true)}
          />
        ) : path === '/activity' ? (
          <Activity activities={activities} />
        ) : path === '/analytics' ? (
          <Analytics />
        ) : path === '/publish' ? (
          <Publish
            wallet={wallet}
            notify={notify}
            onAddProduct={handleAddProduct}
            onActivity={handleAddActivity}
            onConnect={() => setWalletOpen(true)}
            navigate={navigate}
          />
        ) : (
          <NotFound navigate={navigate} />
        )}
      </main>

      <Footer navigate={navigate} />

      {walletOpen && (
        <WalletDialog
          wallet={wallet}
          onConnect={handleConnectWallet}
          onDisconnect={() => {
            setWallet({ address: null, chainId: null, isCorrectChain: false, balanceBOT: '0.0' });
            setWalletOpen(false);
            notify('Wallet disconnected');
          }}
          close={() => setWalletOpen(false)}
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Header({
  path,
  navigate,
  wallet,
  onWallet,
  onSwitchChain,
  mobileOpen,
  setMobileOpen,
}: {
  path: string;
  navigate: (path: string) => void;
  wallet: WalletState;
  onWallet: () => void;
  onSwitchChain: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  return (
    <header className="topbar">
      <div className="nav-wrap">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="brand-mark" />
          DataBounty
        </button>
        <nav className={mobileOpen ? 'mobile-nav open' : 'desktop-nav'}>
          {navItems.map(([label, href]) => (
            <button
              key={label}
              className={(path === href || (label === 'For Providers' && path === '/provider')) ? 'nav-active' : ''}
              onClick={() => navigate(href)}
            >
              {label}
            </button>
          ))}
        </nav>
        {wallet.address && !wallet.isCorrectChain ? (
          <button className="wallet-button" style={{ borderColor: '#ff4444', color: '#ff9999' }} onClick={onSwitchChain}>
            <AlertCircle size={14} />
            Switch to BOT Chain
          </button>
        ) : (
          <button className="wallet-button" onClick={onWallet}>
            {wallet.address ? (
              <>
                <span className="live-dot" />
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)} ({Number(wallet.balanceBOT).toFixed(3)} BOT)
              </>
            ) : (
              <>
                <Wallet size={15} />
                Connect wallet
              </>
            )}
          </button>
        )}
        <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

function Landing({ navigate, products }: { navigate: (path: string) => void; products: Product[] }) {
  return (
    <>
      <section className="hero page-pad">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="red-star">✦</span> THE DATA ECONOMY, SETTLED ONCHAIN
          </div>
          <h1>Your data.<br /><em>Their demand.</em><br />Fair payment.</h1>
          <p className="hero-lede">
            Discover datasets, APIs, and live data feeds on <strong>BOT Chain Mainnet</strong>. Give buyers transparent access terms and earn native BOT when your data is used.
          </p>
          <div className="hero-actions">
            <button className="button button-light" onClick={() => navigate('/marketplace')}>
              Explore marketplace <ArrowUpRight size={16} />
            </button>
            <button className="button button-ghost" onClick={() => navigate('/publish')}>
              Publish your data <Plus size={16} />
            </button>
          </div>
        </div>
        <HeroArtwork navigate={navigate} />
      </section>

      <div className="trust-strip page-pad">
        <span>BUILT FOR THE OPEN DATA ECONOMY</span>
        <div>
          <span><Database size={15} />Dataset discovery</span>
          <span><Zap size={15} />Usage-based billing</span>
          <span><ShieldCheck size={15} />Transparent settlement</span>
          <span><TrendingUp size={15} />BOT Native</span>
        </div>
      </div>

      <section className="section page-pad" id="how">
        <SectionHeader
          eyebrow="THE MARKETPLACE"
          title={<>Useful data, <span>ready to move.</span></>}
          action="View all products"
          onAction={() => navigate('/marketplace')}
        />
        <div className="product-grid featured-grid">
          {products.slice(0, 3).map((product) => (
            <ProductCard key={product.id} product={product} onClick={() => navigate('/marketplace/' + product.id)} />
          ))}
        </div>
      </section>

      <HowItWorks />
      <ProviderPromo navigate={navigate} />

      <section className="closing-cta page-pad">
        <div>
          <div className="eyebrow">START WITH DATA</div>
          <h2>Make data work<br /><span>harder.</span></h2>
        </div>
        <button className="button button-light" onClick={() => navigate('/marketplace')}>
          Explore the marketplace <ArrowUpRight size={16} />
        </button>
      </section>
    </>
  );
}

function HeroArtwork({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="hero-art">
      <div className="wave wave-one" />
      <div className="wave wave-two" />
      <div className="signal-card card-large">
        <div className="card-kicker">BOT CHAIN MAINNET / 677</div>
        <div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="signal-value">26.8M<span>#</span></div>
        <small>ACTIVE BLOCK HEIGHT</small>
      </div>
      <div className="floating-card card-top">
        <span className="tiny-label">VERIFIED PROTOCOL</span>
        <strong>DataBounty<br />Core</strong>
        <div className="card-foot">
          <span>MAINNET</span>
          <ArrowUpRight size={14} />
        </div>
      </div>
      <div className="floating-card card-bottom">
        <span className="tiny-label">NATIVE SETTLEMENT</span>
        <strong>2.50<small>% FEE</small></strong>
        <div className="credit-bars"><i /><i /><i /><i /><i /></div>
      </div>
      <button className="art-link" onClick={() => navigate('/marketplace')}>
        Browse live products <ChevronRight size={15} />
      </button>
    </div>
  );
}

function SectionHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="section-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action} <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="section page-pad how-section">
      <SectionHeader
        eyebrow="A CLEARER WAY TO BUY AND SELL"
        title={<>From useful data<br /><span>to fair value.</span></>}
      />
      <div className="steps">
        <div className="step">
          <span>01</span>
          <div>
            <h3>List your signal</h3>
            <p>Define what your data does, set unit pricing in native BOT, and register the product onchain.</p>
          </div>
        </div>
        <div className="step">
          <span>02</span>
          <div>
            <h3>Purchase credits</h3>
            <p>Buyers purchase prepaid usage credits secured by the DataBountyCore contract.</p>
          </div>
        </div>
        <div className="step">
          <span>03</span>
          <div>
            <h3>Settle with receipts</h3>
            <p>Offchain consumption generates a canonical receipt hash that settles payment and updates provider balances.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProviderPromo({ navigate }: { navigate: (path: string) => void }) {
  return (
    <section className="provider-promo page-pad">
      <div className="provider-visual">
        <div className="orbit orbit-a" />
        <div className="orbit orbit-b" />
        <div className="provider-core">
          <Cloud size={25} />
          <span>YOUR DATA</span>
        </div>
        <div className="orbit-tag tag-a">DISCOVERY</div>
        <div className="orbit-tag tag-b">BILLING</div>
        <div className="orbit-tag tag-c">SETTLEMENT</div>
      </div>
      <div className="provider-copy">
        <div className="eyebrow">FOR PROVIDERS</div>
        <h2>Turn your data<br /><span>into a product.</span></h2>
        <p>DataBounty gives data producers the infrastructure to publish with confidence, meter usage accurately, and withdraw accrued proceeds directly on BOT Chain.</p>
        <button className="button button-light" onClick={() => navigate('/publish')}>
          Publish your data <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}

function Marketplace({ navigate, products }: { navigate: (path: string) => void; products: Product[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All products');
  const [pricing, setPricing] = useState('All pricing');
  const [sort, setSort] = useState('Featured');
  const [list, setList] = useState(false);

  const filtered = useMemo(() => (
    products.filter(p =>
      (category === 'All products' || p.category === category) &&
      (pricing === 'All pricing' || p.pricing === pricing) &&
      `${p.name} ${p.provider} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => sort === 'Name' ? a.name.localeCompare(b.name) : 0)
  ), [products, query, category, pricing, sort]);

  return (
    <div className="page page-pad">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DISCOVER WITH INTENT</div>
          <h1>The Data <span>Marketplace</span></h1>
          <p>Signals, datasets, and APIs settled with native BOT on BOT Chain Mainnet.</p>
        </div>
        <button className="button button-light" onClick={() => navigate('/publish')}>
          Publish data <Plus size={16} />
        </button>
      </div>

      <div className="market-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products, providers, categories" />
        </label>
        <div className="toolbar-actions">
          <Select value={category} onChange={setCategory} options={categories} />
          <Select value={pricing} onChange={setPricing} options={['All pricing', 'Subscription', 'Access credits', 'Usage-based']} />
          <Select value={sort} onChange={setSort} options={['Featured', 'Name']} />
          <button className={list ? 'icon-button active' : 'icon-button'} onClick={() => setList(!list)}>
            {list ? <ClipboardList size={17} /> : <Layers3 size={17} />}
          </button>
        </div>
      </div>

      <div className="market-meta">
        <span>{filtered.length} products available</span>
        <span><Filter size={14} /> Curated BOT Chain data products</span>
      </div>

      {filtered.length ? (
        <div className={list ? 'product-grid list-view' : 'product-grid'}>
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} onClick={() => navigate('/marketplace/' + product.id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No products match your filters"
          text="Try a broader category or search term."
          action="Reset filters"
          onAction={() => { setQuery(''); setCategory('All products'); setPricing('All pricing'); }}
        />
      )}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="select-wrap">
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <button className="product-card" onClick={onClick}>
      <div className={`product-art ${product.accent}`}>
        <span>{product.tag}</span>
        <div className="art-grid" />
        <div className="art-swoop" />
      </div>
      <div className="product-card-content">
        <div className="card-label">
          <span>{product.type}</span>
          {product.onchainVerified ? (
            <span className="onchain-badge"><ShieldCheck size={11} /> Mainnet Live</span>
          ) : product.verified ? (
            <span className="verified"><ShieldCheck size={13} /> Verified</span>
          ) : null}
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="card-provider">
          <span className="provider-avatar">{product.provider.slice(0, 1)}</span>
          {product.provider}
          <span className="card-arrow"><ArrowUpRight size={15} /></span>
        </div>
        <div className="price-row">
          <span className="pricing-pill">{product.pricing}</span>
          <strong>{product.price} <small>BOT / {product.unit || 'credit'}</small></strong>
        </div>
      </div>
    </button>
  );
}

function ProductDetail({
  id,
  products,
  wallet,
  navigate,
  notify,
  onActivity,
  onConnect,
}: {
  id: string;
  products: Product[];
  wallet: WalletState;
  navigate: (path: string) => void;
  notify: (message: string) => void;
  onActivity: (item: ActivityItem) => void;
  onConnect: () => void;
}) {
  const product = products.find(p => p.id === id) || products[0];
  const [quantity, setQuantity] = useState(10);
  const [credits, setCredits] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [recentReceipt, setRecentReceipt] = useState<CanonicalReceipt | null>(null);

  // Load user credits for this product if wallet is connected
  useEffect(() => {
    let active = true;
    if (wallet.address) {
      fetchBuyerCredits(product.id, wallet.address)
        .then(c => { if (active) setCredits(c); })
        .catch(console.error);
    } else {
      setCredits(0n);
    }
    return () => { active = false; };
  }, [wallet.address, product.id]);

  const unitPriceBOT = Number(product.price);
  const totalCostBOT = (unitPriceBOT * quantity).toFixed(6);

  const handlePurchase = async () => {
    if (!wallet.address) {
      onConnect();
      return;
    }
    if (!wallet.isCorrectChain) {
      notify('Please switch to BOT Chain Mainnet before purchasing');
      return;
    }

    try {
      setLoading(true);
      notify(`Purchasing ${quantity} credits for ${totalCostBOT} BOT onchain...`);

      const priceWei = product.priceWei || ethers.parseEther(product.price);
      const receipt = await purchaseCreditsOnchain(product.id, quantity, priceWei);

      notify(`Purchase confirmed! Tx: ${receipt.hash.slice(0, 10)}…`);
      onActivity({
        id: `purchase-${Date.now()}`,
        type: 'Purchase',
        title: `Purchased ${quantity} Credits for ${product.name}`,
        detail: `Paid ${totalCostBOT} BOT on BOT Chain Mainnet`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        timestamp: 'Just now',
      });

      // Refresh credits
      const updated = await fetchBuyerCredits(product.id, wallet.address);
      setCredits(updated);
    } catch (err: any) {
      console.error(err);
      notify(err.reason || err.message || 'Transaction failed or rejected');
    } finally {
      setLoading(false);
    }
  };

  const handleSettleReceipt = async () => {
    if (!wallet.address) {
      onConnect();
      return;
    }
    if (credits === 0n) {
      notify('You have no prepaid credits remaining to settle usage.');
      return;
    }

    const consumeQty = Math.min(5, Number(credits));
    try {
      setLoading(true);
      notify(`Generating canonical receipt and settling ${consumeQty} credits...`);

      const canonicalReceipt = generateUsageReceipt({
        productId: product.id,
        buyer: wallet.address,
        quantity: consumeQty,
        billingUnit: product.unit || 'query',
      });

      setRecentReceipt(canonicalReceipt);

      const receipt = await settleUsageOnchain(product.id, consumeQty, canonicalReceipt.receiptHash);

      notify(`Settlement confirmed onchain! Tx: ${receipt.hash.slice(0, 10)}…`);
      onActivity({
        id: `settle-${Date.now()}`,
        type: 'Settlement',
        title: `Settled ${consumeQty} Credits for ${product.name}`,
        detail: `Receipt hash: ${canonicalReceipt.receiptHash.slice(0, 10)}…`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        timestamp: 'Just now',
      });

      // Refresh credits
      const updated = await fetchBuyerCredits(product.id, wallet.address);
      setCredits(updated);
    } catch (err: any) {
      console.error(err);
      notify(err.reason || err.message || 'Settlement failed or rejected');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page page-pad detail-page">
      <button className="back-link" onClick={() => navigate('/marketplace')}>
        <ChevronRight size={15} className="back-chevron" />
        Back to marketplace
      </button>

      <div className="detail-layout">
        <div>
          <div className={`detail-art product-art ${product.accent}`}>
            <span>{product.tag} / PRODUCT OVERVIEW</span>
            <div className="art-grid" />
            <div className="art-swoop" />
            <div className="detail-art-stat">
              <small>YOUR BALANCE</small>
              <strong>{credits.toString()}</strong>
              <small>PREPAID CREDITS</small>
            </div>
          </div>

          <div className="detail-section">
            <div className="eyebrow">ABOUT THIS PRODUCT</div>
            <h2>Built for teams that need signal, not noise.</h2>
            <p>
              {product.description} Integrates cleanly with BOT Chain Mainnet contracts. All purchases and usage settlements are enforced natively by DataBountyCore with zero intermediary risk.
            </p>

            {recentReceipt && (
              <div className="receipt-card">
                <div className="card-label">
                  <ShieldCheck size={14} color="#91d36c" />
                  <span>CANONICAL USAGE RECEIPT SETTLED</span>
                </div>
                <pre>{recentReceipt.canonicalJson}</pre>
                <div style={{ fontSize: 10, color: '#888', wordBreak: 'break-all' }}>
                  <strong>Receipt Hash:</strong> {recentReceipt.receiptHash}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="detail-aside">
          <div className="detail-heading">
            <div className="card-label">
              <span>{product.type}</span>
              {product.onchainVerified ? (
                <span className="onchain-badge"><ShieldCheck size={11} /> Mainnet Live</span>
              ) : (
                <span className="verified"><ShieldCheck size={13} /> Verified metadata</span>
              )}
            </div>
            <h1>{product.name}</h1>
            <p>Published by <strong>{product.provider}</strong></p>
          </div>

          <div className="term-box">
            <div className="term-row">
              <span>Pricing model</span>
              <strong>{product.pricing}</strong>
            </div>
            <div className="term-row">
              <span>Payment Asset</span>
              <strong>Native BOT (Chain 677)</strong>
            </div>
            <div className="term-row">
              <span>Available Credits</span>
              <strong style={{ color: '#91d36c' }}>{credits.toString()} credits</strong>
            </div>
            <div className="term-row">
              <span>Delivery</span>
              <strong>Secure API / Canonical Receipt</strong>
            </div>
          </div>

          <div className="cost-box">
            <div className="eyebrow">PREPAID CREDIT PURCHASE</div>
            <div className="cost-line">
              <span>Credit quantity <small>× {quantity}</small></span>
              <strong>{product.price} BOT</strong>
            </div>
            <div className="cost-total">
              <span>Total due</span>
              <strong>{totalCostBOT} BOT</strong>
            </div>
            <div className="quantity">
              <span>Quantity</span>
              <div>
                <button onClick={() => setQuantity(Math.max(1, quantity - 5))}>−</button>
                <strong>{quantity}</strong>
                <button onClick={() => setQuantity(quantity + 5)}>+</button>
              </div>
            </div>

            <button
              className="button button-light full"
              disabled={loading}
              onClick={handlePurchase}
            >
              {loading ? 'Confirming on BOT Chain...' : 'Purchase Credits'} <ArrowUpRight size={16} />
            </button>

            {credits > 0n && (
              <button
                className="button button-ghost full"
                style={{ marginTop: 8 }}
                disabled={loading}
                onClick={handleSettleReceipt}
              >
                Simulate Usage & Settle Receipt <Zap size={15} />
              </button>
            )}

            <small className="fine-print">
              Executed via DataBountyCore on BOT Chain Mainnet.
            </small>
          </div>
        </aside>
      </div>

      <div className="detail-section fields-section">
        <div className="section-header">
          <div>
            <div className="eyebrow">AVAILABLE SCHEMA</div>
            <h2>Know what you are buying.</h2>
          </div>
          <span className="format-badge"><FileJson size={15} /> JSON / CSV</span>
        </div>
        <div className="fields-grid">
          {product.fields.map((field, index) => (
            <div className="field" key={field}>
              <span>0{index + 1}</span>
              <strong>{field}</strong>
              <small>{index % 2 ? 'number' : 'string'}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Provider({
  navigate,
  wallet,
  products,
  notify,
  onActivity,
  onConnect,
}: {
  navigate: (path: string) => void;
  wallet: WalletState;
  products: Product[];
  notify: (message: string) => void;
  onActivity: (item: ActivityItem) => void;
  onConnect: () => void;
}) {
  const [claimableBOT, setClaimableBOT] = useState<string>('0.0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (wallet.address) {
      fetchProviderProceeds(wallet.address)
        .then(val => {
          if (active) setClaimableBOT(ethers.formatEther(val));
        })
        .catch(console.error);
    } else {
      setClaimableBOT('0.0');
    }
    return () => { active = false; };
  }, [wallet.address]);

  const handleWithdraw = async () => {
    if (!wallet.address) {
      onConnect();
      return;
    }
    if (claimableBOT === '0.0' || Number(claimableBOT) === 0) {
      notify('No claimable proceeds currently available.');
      return;
    }

    try {
      setLoading(true);
      notify('Withdrawing provider proceeds from DataBountyCore...');
      const receipt = await withdrawProviderProceedsOnchain();

      notify(`Proceeds successfully withdrawn! Tx: ${receipt.hash.slice(0, 10)}…`);
      onActivity({
        id: `withdraw-${Date.now()}`,
        type: 'Withdrawal',
        title: 'Withdrew Provider Proceeds',
        detail: `Withdrew ${claimableBOT} BOT to wallet`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        timestamp: 'Just now',
      });

      setClaimableBOT('0.0');
    } catch (err: any) {
      console.error(err);
      notify(err.reason || err.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const providerProducts = wallet.address
    ? products.filter(p => p.providerAddress?.toLowerCase() === wallet.address?.toLowerCase())
    : [];

  return (
    <DashboardLayout
      eyebrow="PROVIDER WORKSPACE"
      title="Good data deserves a clear home."
      action="Publish a product"
      onAction={() => navigate('/publish')}
    >
      <div className="metric-grid">
        <Metric
          label="Claimable Proceeds"
          value={wallet.address ? `${Number(claimableBOT).toFixed(4)} BOT` : '—'}
          note={wallet.address ? 'Accrued from settled receipts' : 'Connect wallet to view'}
          icon={<TrendingUp size={17} />}
        />
        <Metric
          label="Listed products"
          value={wallet.address ? String(providerProducts.length) : '1'}
          note="Live on BOT Chain Mainnet"
          icon={<Database size={17} />}
        />
        <Metric
          label="Marketplace Fee"
          value="2.50%"
          note="Protocol fee deducted at settlement"
          icon={<ShieldCheck size={17} />}
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel wide">
          <PanelTitle title="Your Active Listings" action="Manage listings" />
          <div className="table-list">
            <TableRow
              product="Climate Grid Signals"
              detail="0.0001 BOT / credit · Onchain Mainnet"
              status="Live"
            />
            {providerProducts.map(p => (
              <TableRow
                key={p.id}
                product={p.name}
                detail={`${p.price} BOT / credit · ${p.category}`}
                status="Active"
              />
            ))}
          </div>

          <div className="panel-empty">
            <UploadCloud size={20} />
            <span>Have new dataset signals or API feeds to monetize?</span>
            <button onClick={() => navigate('/publish')}>
              Create listing <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        <div className="panel">
          <PanelTitle title="Proceeds & Withdrawals" />
          <div className="plan-empty" style={{ height: 'auto', padding: '24px 0' }}>
            <Circle size={32} />
            <strong>Claimable: {Number(claimableBOT).toFixed(5)} BOT</strong>
            <p>Direct pull-payment withdrawal with reentrancy protection.</p>
            <button
              className="button button-light"
              style={{ marginTop: 12 }}
              disabled={loading || Number(claimableBOT) <= 0}
              onClick={handleWithdraw}
            >
              {loading ? 'Processing...' : 'Withdraw Proceeds'} <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Buyer({
  navigate,
  wallet,
  products,
  activities,
  onConnect,
}: {
  navigate: (path: string) => void;
  wallet: WalletState;
  products: Product[];
  activities: ActivityItem[];
  onConnect: () => void;
}) {
  const settlements = activities.filter(a => a.type === 'Settlement');

  return (
    <DashboardLayout
      eyebrow="BUYER WORKSPACE"
      title="Keep every access term in view."
      action="Explore marketplace"
      onAction={() => navigate('/marketplace')}
    >
      <div className="metric-grid">
        <Metric
          label="Wallet Status"
          value={wallet.address ? 'Connected' : 'Disconnected'}
          note={wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : 'Connect to load balances'}
          icon={<ShieldCheck size={17} />}
        />
        <Metric
          label="BOT Balance"
          value={wallet.address ? `${Number(wallet.balanceBOT).toFixed(3)} BOT` : '—'}
          note="Available on BOT Chain Mainnet"
          icon={<Zap size={17} />}
        />
        <Metric
          label="Usage receipts"
          value={String(settlements.length)}
          note="Cryptographically verified"
          icon={<ClipboardList size={17} />}
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel wide">
          <PanelTitle title="Available Catalog" />
          <div className="table-list">
            {products.map(p => (
              <TableRow
                key={p.id}
                product={p.name}
                detail={`${p.price} BOT / credit · ${p.type}`}
                status="Ready"
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelTitle title="Recent Usage Settlements" />
          {settlements.length > 0 ? (
            <div className="table-list">
              {settlements.slice(0, 4).map(s => (
                <div className="table-row" key={s.id}>
                  <span className="row-art"><Zap size={16} /></span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.detail}</small>
                  </div>
                  <a
                    href={`https://scan.botchain.ai/tx/${s.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="status"
                    style={{ textDecoration: 'none' }}
                  >
                    BOTScan ↗
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="plan-empty">
              <Circle size={32} />
              <strong>No receipts settled yet</strong>
              <p>Purchase credits and consume dataset queries to view onchain settlements.</p>
              {!wallet.address && (
                <button className="button button-light" onClick={onConnect}>
                  Connect Wallet
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Activity({ activities }: { activities: ActivityItem[] }) {
  const [filter, setFilter] = useState<'All' | 'Deployment' | 'Registration' | 'Purchase' | 'Settlement'>('All');

  const filtered = activities.filter(a => filter === 'All' || a.type === filter);

  return (
    <DashboardLayout eyebrow="ACTIVITY" title="A readable history of every action.">
      <div className="activity-filters">
        <button className={filter === 'All' ? 'filter-active' : ''} onClick={() => setFilter('All')}>
          All activity
        </button>
        <button className={filter === 'Purchase' ? 'filter-active' : ''} onClick={() => setFilter('Purchase')}>
          Purchases
        </button>
        <button className={filter === 'Settlement' ? 'filter-active' : ''} onClick={() => setFilter('Settlement')}>
          Settlements
        </button>
        <button className={filter === 'Registration' ? 'filter-active' : ''} onClick={() => setFilter('Registration')}>
          Listings
        </button>
      </div>

      <div className="panel wide">
        <div className="table-list" style={{ marginTop: 0 }}>
          {filtered.map(act => (
            <div className="table-row" key={act.id}>
              <span className="row-art">
                {act.type === 'Settlement' ? <Zap size={16} /> : act.type === 'Purchase' ? <TrendingUp size={16} /> : <Database size={16} />}
              </span>
              <div>
                <strong>{act.title}</strong>
                <small>{act.detail} · Block {act.blockNumber || 'Confirmed'}</small>
              </div>
              <a
                href={`https://scan.botchain.ai/tx/${act.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="status"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                BOTScan <ExternalLink size={11} />
              </a>
              <ChevronRight size={15} />
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Analytics() {
  return (
    <DashboardLayout eyebrow="ANALYTICS" title="See what is moving, clearly.">
      <div className="analytics-header">
        <div>
          <p className="muted">Verified Protocol Telemetry on BOT Chain Mainnet.</p>
        </div>
        <span className="onchain-badge">
          <ShieldCheck size={12} /> Chain ID: 677
        </span>
      </div>

      <div className="metric-grid">
        <Metric
          label="Contract Address"
          value="0xcB74…F994"
          note="DataBountyCore on BOT Chain Mainnet"
          icon={<ShieldCheck size={17} />}
        />
        <Metric
          label="Marketplace Fee"
          value="2.50%"
          note="Capped at 10.00% max"
          icon={<TrendingUp size={17} />}
        />
        <Metric
          label="Deployment Block"
          value={String(BOT_CHAIN_CONFIG.deploymentBlock)}
          note="Verified on BOTScan"
          icon={<Database size={17} />}
        />
      </div>

      <div className="chart-panel panel" style={{ marginTop: 16 }}>
        <div className="panel-title">
          <span>Protocol Architecture Specifications</span>
          <a
            href={BOT_CHAIN_CONFIG.explorerUrl + '/address/' + BOT_CHAIN_CONFIG.contractAddress}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            View on BOTScan <ExternalLink size={12} />
          </a>
        </div>
        <div style={{ padding: '24px 0', fontSize: 13, color: '#aaa', lineHeight: 1.8 }}>
          <p>
            <strong>Core Primitive:</strong> Minimal viable usage billing with single-contract architecture and native BOT settlement.
          </p>
          <p>
            <strong>Security Controls:</strong> Checks-effects-interactions, custom lightweight reentrancy guard, canonical receipt replay prevention, and immutable protocol ownership.
          </p>
          <p>
            <strong>RPC Endpoint:</strong> <code>{BOT_CHAIN_CONFIG.rpcUrl}</code>
          </p>
          <p>
            <strong>Explorer:</strong> <code>{BOT_CHAIN_CONFIG.explorerUrl}</code>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DashboardLayout({ eyebrow, title, action, onAction, children }: { eyebrow: string; title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <div className="page page-pad dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        {action && (
          <button className="button button-light" onClick={onAction}>
            {action} <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon?: React.ReactNode }) {
  return (
    <div className="metric panel">
      <div className="metric-icon">{icon || <TrendingUp size={17} />}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function PanelTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="panel-title">
      <strong>{title}</strong>
      {action && (
        <button>{action} <ArrowUpRight size={14} /></button>
      )}
    </div>
  );
}

function TableRow({ product, detail, status, empty }: { product: string; detail: string; status: string; empty?: boolean }) {
  return (
    <div className="table-row">
      <span className="row-art"><Database size={16} /></span>
      <div>
        <strong>{product}</strong>
        <small>{detail}</small>
      </div>
      <span className={empty ? 'status muted-status' : 'status'}>{status}</span>
      <ChevronRight size={15} />
    </div>
  );
}

function Publish({
  wallet,
  notify,
  onAddProduct,
  onActivity,
  onConnect,
  navigate,
}: {
  wallet: WalletState;
  notify: (message: string) => void;
  onAddProduct: (prod: Product) => void;
  onActivity: (item: ActivityItem) => void;
  onConnect: () => void;
  navigate: (path: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pricing, setPricing] = useState('Access credits');
  const [category, setCategory] = useState(categories[1]);
  const [priceBOT, setPriceBOT] = useState('0.0002');
  const [loading, setLoading] = useState(false);

  const valid = name.trim().length > 2 && description.trim().length > 12;

  const next = () => {
    if (step === 1 && !valid) {
      notify('Add a name and a fuller description to continue');
      return;
    }
    setStep(Math.min(4, step + 1));
  };

  const handlePublish = async () => {
    if (!wallet.address) {
      onConnect();
      return;
    }
    if (!wallet.isCorrectChain) {
      notify('Please switch to BOT Chain Mainnet before publishing');
      return;
    }

    try {
      setLoading(true);
      notify('Publishing product to DataBountyCore on BOT Chain Mainnet...');

      const productId = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 31);
      const metadataURI = `ipfs://bafybei${productId}${Date.now()}`;

      const receipt = await registerProductOnchain(productId, priceBOT, metadataURI);

      notify(`Product registered onchain! Tx: ${receipt.hash.slice(0, 10)}…`);

      const newProd: Product = {
        id: productId,
        name,
        provider: wallet.address.slice(0, 6) + '…',
        providerAddress: wallet.address,
        description,
        category,
        type: 'Dataset',
        pricing: 'Access credits',
        price: priceBOT,
        priceWei: ethers.parseEther(priceBOT),
        unit: 'credit',
        accent: 'warm',
        tag: 'NEW',
        verified: true,
        onchainVerified: true,
        fields: ['id', 'timestamp', 'payload_hash', 'metric_value'],
      };

      onAddProduct(newProd);

      onActivity({
        id: `reg-${Date.now()}`,
        type: 'Registration',
        title: `Registered Product ${name}`,
        detail: `${priceBOT} BOT / credit on BOT Chain Mainnet`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        timestamp: 'Just now',
      });

      navigate('/marketplace/' + productId);
    } catch (err: any) {
      console.error(err);
      notify(err.reason || err.message || 'Product registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page page-pad publish-page">
      <div className="publish-intro">
        <div>
          <div className="eyebrow">PUBLISH DATA</div>
          <h1>Make your signal<br /><span>discoverable.</span></h1>
          <p>Give buyers clarity to act with confidence. Register your terms onchain with native BOT pricing.</p>
        </div>
        <div className="stepper">
          {['Identity', 'Delivery', 'Pricing', 'Review'].map((label, i) => (
            <div className={step === i + 1 ? 'step-active' : step > i + 1 ? 'step-done' : ''} key={label}>
              <span>{step > i + 1 ? <Check size={14} /> : `0${i + 1}`}</span>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="publish-card panel">
        {step === 1 && (
          <>
            <FormIntro eyebrow="01 / PRODUCT IDENTITY" title="Start with the signal." />
            <div className="form-grid">
              <label className="field-label span-2">
                Product name
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Real-Time Energy Demand Index" />
              </label>
              <label className="field-label">
                Category
                <Select value={category} onChange={setCategory} options={categories.slice(1)} />
              </label>
              <label className="field-label">
                Product type
                <Select value="Dataset" onChange={() => {}} options={['Dataset', 'API', 'Live feed']} />
              </label>
              <label className="field-label span-2">
                Short description
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What does this data help someone do?"
                  rows={5}
                />
              </label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <FormIntro eyebrow="02 / DELIVERY & METADATA" title="Make access legible." />
            <div className="form-grid">
              <label className="field-label">
                Data format
                <Select value="JSON" onChange={() => {}} options={['JSON', 'CSV', 'Parquet', 'WebSocket']} />
              </label>
              <label className="field-label">
                Update frequency
                <Select value="Daily" onChange={() => {}} options={['Real-time', 'Hourly', 'Daily', 'Weekly']} />
              </label>
              <label className="field-label span-2">
                Delivery endpoint or access instructions
                <textarea placeholder="Describe the delivery path. Never paste private credentials here." rows={5} />
              </label>
              <label className="field-label span-2">
                Schema description
                <textarea placeholder="List key fields and meaning." rows={4} />
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <FormIntro eyebrow="03 / PRICING" title="Set fair, visible terms." />
            <div className="pricing-options">
              {['Access credits', 'Usage-based', 'Subscription'].map(option => (
                <button
                  key={option}
                  className={pricing === option ? 'pricing-option selected' : 'pricing-option'}
                  onClick={() => setPricing(option)}
                >
                  <span className="radio-dot" />
                  <span>
                    <strong>{option}</strong>
                    <small>
                      {option === 'Subscription' ? 'Recurring access for a defined period.' : option === 'Access credits' ? 'Prepaid access for a known quantity.' : 'Pay only when the signal is used.'}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>

            <div className="form-grid pricing-fields">
              <label className="field-label">
                Settlement Currency
                <Select value="BOT (Native)" onChange={() => {}} options={['BOT (Native)']}/>
              </label>
              <label className="field-label">
                Price per Credit (in BOT)
                <input
                  value={priceBOT}
                  onChange={e => setPriceBOT(e.target.value)}
                  placeholder="0.0002"
                  type="number"
                  step="0.00001"
                />
              </label>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <FormIntro eyebrow="04 / REVIEW" title="Ready for onchain deployment." />
            <div className="review-card">
              <div>
                <span>PRODUCT</span>
                <strong>{name || 'Untitled data product'}</strong>
                <small>{category} · Dataset</small>
              </div>
              <div>
                <span>DESCRIPTION</span>
                <p>{description || 'Add a description in step one.'}</p>
              </div>
              <div>
                <span>PRICING</span>
                <strong>{priceBOT} BOT / credit</strong>
                <small>Enforced by DataBountyCore on BOT Chain Mainnet.</small>
              </div>
            </div>
            <div className="review-note">
              <ShieldCheck size={17} />
              <span>
                Publishing will trigger a transaction on BOT Chain Mainnet to register this product ID and terms in the contract.
              </span>
            </div>
          </>
        )}

        <div className="form-footer">
          <button className="back-link" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
            Back
          </button>
          {step < 4 ? (
            <button className="button button-light" onClick={next}>
              Continue <ArrowUpRight size={16} />
            </button>
          ) : (
            <button
              className="button button-light"
              disabled={loading}
              onClick={handlePublish}
            >
              {loading ? 'Confirming onchain...' : 'Publish to BOT Chain'} <UploadCloud size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="form-intro">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
    </div>
  );
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="empty-state">
      <Search size={20} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button button-ghost" onClick={onAction}>{action}</button>
    </div>
  );
}

function WalletDialog({
  wallet,
  onConnect,
  onDisconnect,
  close,
}: {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="wallet-modal" onClick={e => e.stopPropagation()}>
        <button className="close-modal" onClick={close}>
          <X size={18} />
        </button>
        <div className="wallet-icon">
          <Wallet size={21} />
        </div>
        <div className="eyebrow">BOT CHAIN WALLET</div>
        <h2>{wallet.address ? 'Wallet connected.' : 'Connect to continue.'}</h2>
        <p>
          {wallet.address ? (
            <>Connected to <strong>{wallet.address.slice(0, 10)}…{wallet.address.slice(-6)}</strong> on {wallet.isCorrectChain ? 'BOT Chain Mainnet (677)' : `Chain ID: ${wallet.chainId}`}</>
          ) : (
            'Connect your Web3 browser wallet (MetaMask, Rabby, OKX) configured for BOT Chain Mainnet.'
          )}
        </p>

        {wallet.address ? (
          <button className="button button-light full" onClick={onDisconnect}>
            Disconnect wallet
          </button>
        ) : (
          <button className="wallet-provider" onClick={onConnect}>
            <span className="provider-icon"><Globe2 size={17} /></span>
            <span>
              <strong>Browser wallet</strong>
              <small>Connect with EVM wallet for BOT Chain</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}

        <small className="fine-print">
          Connected to contract <code>{BOT_CHAIN_CONFIG.contractAddress.slice(0, 10)}…</code> on BOT Chain Mainnet.
        </small>
      </div>
    </div>
  );
}

function Footer({ navigate }: { navigate: (path: string) => void }) {
  return (
    <footer className="footer page-pad">
      <button className="brand" onClick={() => navigate('/')}>
        <span className="brand-mark" />
        DataBounty
      </button>

      <div className="footer-links">
        <button onClick={() => navigate('/marketplace')}>Marketplace</button>
        <button onClick={() => navigate('/provider')}>For providers</button>
        <button onClick={() => navigate('/activity')}>Activity</button>
        <button onClick={() => navigate('/analytics')}>Analytics</button>

        {/* Clickable links to official BOT Chain and BOTScan */}
        <a
          href="https://dev-docs.botchain.ai/docs/Developers/quick-guide/"
          target="_blank"
          rel="noopener noreferrer"
        >
          BOT Chain <ExternalLink size={11} />
        </a>
        <a
          href="https://scan.botchain.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          BOTScan <ExternalLink size={11} />
        </a>
      </div>

      <span className="footer-note">
        Deployed on BOT Chain Mainnet · Contract <a href={`https://scan.botchain.ai/address/${BOT_CHAIN_CONFIG.contractAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: '#aaa', textDecoration: 'underline' }}>{BOT_CHAIN_CONFIG.contractAddress.slice(0, 6)}…{BOT_CHAIN_CONFIG.contractAddress.slice(-4)}</a>
      </span>
    </footer>
  );
}

function NotFound({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="page page-pad not-found">
      <div className="eyebrow">404 / NOT FOUND</div>
      <h1>This page is<br /><span>not listed.</span></h1>
      <button className="button button-light" onClick={() => navigate('/')}>
        Return home <ArrowUpRight size={16} />
      </button>
    </div>
  );
}

export default App;
