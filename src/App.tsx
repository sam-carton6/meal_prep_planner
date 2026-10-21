import { useEffect, useState } from 'react';
import { CookTab } from './ui/Cook';
import { MoreTab } from './ui/More';
import { PlanTab } from './ui/Plan';
import { RecipesTab } from './ui/Recipes';
import { FoodsProvider } from './ui/shared';
import { ShopTab } from './ui/Shop';

const TABS = [
  ['plan', 'Plan', '📅'],
  ['cook', 'Cook', '🍳'],
  ['recipes', 'Recipes', '📖'],
  ['shop', 'Shop', '🛒'],
  ['more', 'More', '⋯'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('tab') as Tab) || 'plan';
    } catch {
      return 'plan';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('tab', tab);
    } catch {
      /* private mode: fine */
    }
  }, [tab]);

  return (
    <FoodsProvider>
      <div className="app">
        {tab === 'plan' && <PlanTab />}
        {tab === 'cook' && <CookTab />}
        {tab === 'recipes' && <RecipesTab />}
        {tab === 'shop' && <ShopTab />}
        {tab === 'more' && <MoreTab />}
      </div>
      <nav className="tabs">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </FoodsProvider>
  );
}
