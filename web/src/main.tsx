import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/app.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { AuthProvider, useAuth } from './lib/auth';
import { UiProvider } from './lib/ui';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Liked } from './pages/Liked';
import { Login, NotFound, Settings } from './pages/Misc';
import { Radio } from './pages/Radio';
import { Playlist } from './pages/Playlist';
import { Search } from './pages/Search';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (n, err) => n < 1 && !['unauthenticated', 'forbidden', 'not_found', 'quota_exceeded'].includes((err as { code?: string }).code ?? ''),
    },
  },
});

function Gate() {
  const { status } = useAuth();
  if (status !== 'signedIn') return <Login />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/radio" element={<Radio />} />
        <Route path="/library" element={<Library />} />
        <Route path="/liked" element={<Liked />} />
        <Route path="/playlist/:id" element={<Playlist />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <UiProvider>
            <Gate />
          </UiProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
