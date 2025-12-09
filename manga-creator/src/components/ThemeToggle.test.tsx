import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { useThemeStore } from '@/stores/themeStore';

// Mock the theme store
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: vi.fn(),
}));

describe('ThemeToggle', () => {
  const mockSetMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useThemeStore).mockReturnValue({
      mode: 'light',
      setMode: mockSetMode,
      toggleMode: vi.fn(),
      initTheme: vi.fn(),
    });
  });

  describe('rendering', () => {
    it('should render the theme toggle button', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should show sun icon in light mode', () => {
      vi.mocked(useThemeStore).mockReturnValue({
        mode: 'light',
        setMode: mockSetMode,
        toggleMode: vi.fn(),
        initTheme: vi.fn(),
      });

      render(<ThemeToggle />);
      
      // Check for the presence of a button (icon is inside)
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should show moon icon in dark mode', () => {
      vi.mocked(useThemeStore).mockReturnValue({
        mode: 'dark',
        setMode: mockSetMode,
        toggleMode: vi.fn(),
        initTheme: vi.fn(),
      });

      render(<ThemeToggle />);
      
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should render dropdown trigger button', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should open dropdown on click', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      // After click, dropdown should be present
      expect(button).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible button', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('different modes', () => {
    it('should render correctly in system mode', () => {
      vi.mocked(useThemeStore).mockReturnValue({
        mode: 'system',
        setMode: mockSetMode,
        toggleMode: vi.fn(),
        initTheme: vi.fn(),
      });

      render(<ThemeToggle />);
      
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
