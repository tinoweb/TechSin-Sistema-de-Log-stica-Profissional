import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/protected-route";
import { FlashStoreProvider } from "@/lib/flash-store";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Motoristas from "@/pages/motoristas";
import Clientes from "@/pages/clientes";
import Viagens from "@/pages/viagens";
import Canhotos from "@/pages/canhotos";
import Xml from "@/pages/xml";
import Faturas from "@/pages/faturas";
import MotoristaApp from "@/pages/motorista-app";
import DriveApp from "@/pages/drive-app";
import Aprovacao from "@/pages/aprovacao";
import Arquivo from "@/pages/arquivo";
import Entrega from "@/pages/entrega";
import SuperAdmin from "@/pages/super-admin";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      {/* Motorista public routes — no layout */}
      <Route path="/motorista-app" component={MotoristaApp} />
      <Route path="/drive/:token" component={DriveApp} />
      <Route path="/entrega/:id" component={Entrega} />

      {/* Admin routes — exigem sessao ativa. */}
      <Route path="/:rest*">
        <ProtectedRoute>
          <Layout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/aprovacao" component={Aprovacao} />
              <Route path="/motoristas" component={Motoristas} />
              <Route path="/clientes" component={Clientes} />
              <Route path="/viagens" component={Viagens} />
              <Route path="/canhotos" component={Canhotos} />
              <Route path="/xml" component={Xml} />
              <Route path="/faturas" component={Faturas} />
              <Route path="/arquivo" component={Arquivo} />
              <Route path="/super-admin">
                <ProtectedRoute allowedRoles={["superadmin"]}>
                  <SuperAdmin />
                </ProtectedRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="techsin-theme">
        <AuthProvider>
          <FlashStoreProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </FlashStoreProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
