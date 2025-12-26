import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  onSearch: () => void;
  onConfig: () => void;
}

export function AppLayout({ children, onSearch, onConfig }: AppLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const currentProject = useProjectStore((s) => s.currentProject);

  // Auto-collapse on small screens? (Optional optimization)

  const isEditor = location.pathname.startsWith('/projects/');

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        isCollapsed={isCollapsed}
        toggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onSearch={onSearch}
        onConfig={onConfig}
      />
      
      <div className="flex flex-1 flex-col overflow-hidden transition-all duration-300">
        {/* Top Bar (Breadcrumbs) */}
        <header className="flex h-12 items-center border-b px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <nav className="flex items-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">
              首页
            </Link>
            {isEditor && currentProject && (
              <>
                <ChevronRight className="h-4 w-4 mx-2" />
                <span className="font-medium text-foreground">{currentProject.title}</span>
              </>
            )}
            {/* Add more breadcrumbs if needed based on route */}
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">
          <div className={cn("mx-auto h-full", isEditor ? "max-w-[1600px]" : "max-w-7xl")}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
