import { useLocation, Link } from 'react-router-dom';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/utils';
import { ChevronRight, Home } from 'lucide-react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';

interface AppLayoutProps {
  children: React.ReactNode;
  onSearch: () => void;
  onConfig: () => void;
  onSettings: () => void;
}

export function AppLayout({ children, onSearch, onConfig, onSettings }: AppLayoutProps) {
  const location = useLocation();
  const currentProject = useProjectStore((s) => s.currentProject);

  const isEditor = location.pathname.startsWith('/projects/');

  return (
    <SidebarProvider>
      <AppSidebar onSearch={onSearch} onConfig={onConfig} onSettings={onSettings} />

      <SidebarInset className="bg-paper-texture">
        {/* Top Bar with Breadcrumbs */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur-sm">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="h-4" />

          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {isEditor ? (
                  <BreadcrumbLink asChild>
                    <Link
                      to="/"
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Home className="h-3.5 w-3.5" />
                      <span>首页</span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <Home className="h-3.5 w-3.5" />
                    <span>首页</span>
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>

              {isEditor && currentProject && (
                <>
                  <BreadcrumbSeparator>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium max-w-[200px] truncate">
                      {currentProject.title}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Main Content with subtle texture */}
        <main className="flex-1 overflow-auto">
          <div className={cn('mx-auto h-full p-6', isEditor ? 'max-w-[1600px]' : 'max-w-7xl')}>
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
