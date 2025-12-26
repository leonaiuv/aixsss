import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { AppLayout } from './AppLayout';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    // Add mocks for icons if needed, or just use actual
  };
});

describe('AppLayout', () => {
  const renderWithRouter = (component: React.ReactNode) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  it('renders sidebar and main content', () => {
    renderWithRouter(
      <AppLayout onSearch={() => {}} onConfig={() => {}}>
        <div data-testid="main-content">Main Content</div>
      </AppLayout>,
    );

    // Check for Sidebar presence - new UI has split text "漫剧创作" and "AI 分镜助手"
    expect(screen.getByText('漫剧创作')).toBeInTheDocument();

    // Check for Main Content
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('renders breadcrumbs', () => {
    renderWithRouter(
      <AppLayout onSearch={() => {}} onConfig={() => {}}>
        <div>Content</div>
      </AppLayout>,
    );
    // Assuming default breadcrumb or empty state
    // We might need to mock useLocation to test dynamic breadcrumbs
    // Check for home breadcrumb
    expect(screen.getByText('首页')).toBeInTheDocument();
  });
});
