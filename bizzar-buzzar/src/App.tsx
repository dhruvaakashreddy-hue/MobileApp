import { Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from './lib/auth.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { PreviewControls } from './components/PreviewControls.tsx';
import { AdminApp } from './admin/AdminApp.tsx';
import { Account } from './pages/Account.tsx';
import { Alerts } from './pages/Alerts.tsx';
import { Checkout } from './pages/Checkout.tsx';
import { Home } from './pages/Home.tsx';
import { Legal, LEGAL_PAGES } from './pages/Legal.tsx';
import { Login } from './pages/Login.tsx';
import { OrderDetail, Orders } from './pages/Orders.tsx';
import { HowItWorksPage, NotFound, PastDropsPage } from './pages/Static.tsx';

function BuyerApp() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[12px] focus:bg-lime focus:px-4 focus:py-2 focus:text-[#090b0a]"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="pb-28 md:pb-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/past-drops" element={<PastDropsPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/account" element={<Account />} />
          <Route path="/checkout/:reservationId" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:orderId" element={<OrderDetail />} />
          {LEGAL_PAGES.map((page) => (
            <Route key={page.path} path={page.path} element={<Legal page={page.path} />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <BottomNav />
      <PreviewControls />
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <SessionProvider>
      {pathname.startsWith('/admin') ? <AdminApp /> : <BuyerApp />}
    </SessionProvider>
  );
}
