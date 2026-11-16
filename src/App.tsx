import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CreditNoteDetail, CreditNoteList } from "./pages/CreditNotes";
import { CustomerDetail, CustomerForm, CustomerList } from "./pages/Customers";
import { Dashboard } from "./pages/Dashboard";
import { CreditNoteForm, InvoiceDetail, InvoiceEditor, InvoiceList } from "./pages/Invoices";
import { ItemList } from "./pages/Items";
import { PaymentList } from "./pages/Payments";
import { QuoteDetail, QuoteEditor, QuoteList } from "./pages/Quotes";
import { SettingsPage } from "./pages/Settings";
import { ZohoImportPage } from "./pages/ZohoImport";
import { AuthGate } from "./auth";
import { StoreProvider } from "./store";
import { NotFound, Shell } from "./ui";

export function App() {
  return (
    <AuthGate>
      <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<CustomerList />} />
            <Route path="clients/nouveau" element={<CustomerForm mode="create" />} />
            <Route path="clients/:id" element={<CustomerDetail />} />
            <Route path="clients/:id/modifier" element={<CustomerForm mode="edit" />} />
            <Route path="articles" element={<ItemList />} />
            <Route path="devis" element={<QuoteList />} />
            <Route path="devis/nouveau" element={<QuoteEditor />} />
            <Route path="devis/:id" element={<QuoteDetail />} />
            <Route path="devis/:id/modifier" element={<QuoteEditor />} />
            <Route path="factures" element={<InvoiceList />} />
            <Route path="factures/nouvelle" element={<InvoiceEditor />} />
            <Route path="factures/:id" element={<InvoiceDetail />} />
            <Route path="factures/:id/modifier" element={<InvoiceEditor />} />
            <Route path="factures/:id/avoir" element={<CreditNoteForm />} />
            <Route path="avoirs" element={<CreditNoteList />} />
            <Route path="avoirs/:id" element={<CreditNoteDetail />} />
            <Route path="paiements" element={<PaymentList />} />
            <Route path="import-zoho" element={<ZohoImportPage />} />
            <Route path="reglages" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </StoreProvider>
    </AuthGate>
  );
}
