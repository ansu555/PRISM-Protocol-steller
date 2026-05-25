import { Metadata } from 'next';
import { AppProviders } from "@/components/providers/app-providers";
import { AdminVaultProvider } from "@/components/admin/AdminVaultContext";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminGuard } from "@/components/admin/AdminGuard";

export const metadata: Metadata = {
  title: 'Vault Deployment',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AdminVaultProvider>
        <AdminGuard>
          <div className="flex h-screen w-full bg-black text-white overflow-hidden">
            <AdminSidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <AdminTopbar />
              <main className="flex-1 overflow-y-auto" data-admin-scroll="true">
                {children}
              </main>
            </div>
          </div>
        </AdminGuard>
      </AdminVaultProvider>
    </AppProviders>
  );
}
