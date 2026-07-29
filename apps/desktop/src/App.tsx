import { useEffect } from 'react';
import Layout from './Layout';
import QueryProvider from '@/lib/query-provider';

export default function App() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      document.documentElement.classList.toggle('dark', media.matches);
    };

    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, []);

  return (
    <QueryProvider>
      <Layout />
    </QueryProvider>
  );
}
