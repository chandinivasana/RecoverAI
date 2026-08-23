'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem('recoverai_theme') as 'dark' | 'light') || 'dark';
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const applyTheme = (t: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('recoverai_theme', next);
    applyTheme(next);
  };

  if (!mounted) {
    return <div className="w-7 h-7" />;
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle Light and Dark Mode"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-subtle)] border border-[var(--border-main)] transition-colors flex items-center justify-center cursor-pointer shadow-xs"
    >
      {theme === 'dark' ? (
        <Sun className="w-3.5 h-3.5 text-amber-400" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-slate-700" />
      )}
    </button>
  );
};
