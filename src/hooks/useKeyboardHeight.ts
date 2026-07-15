import { useEffect, useState } from 'react';

/**
 * Hook to detect iOS PWA keyboard visibility using the VisualViewport API.
 * Returns the keyboard height (0 when hidden).
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const visualViewport = window.visualViewport;

    const handleResize = () => {
      // Calculate the difference between window inner height and visual viewport height
      // This represents the keyboard height (or 0 if keyboard is hidden)
      const viewportHeight = visualViewport.height;
      const offsetTop = visualViewport.offsetTop;
      const scale = visualViewport.scale;

      // On iOS, when keyboard opens:
      // - visualViewport.height decreases
      // - visualViewport.offsetTop increases (viewport moves up)
      // The keyboard height can be approximated from the difference
      const windowHeight = window.innerHeight;
      const visibleHeight = viewportHeight * scale;
      const keyboardHeight = Math.max(0, windowHeight - visibleHeight - offsetTop);

      setKeyboardHeight(Math.round(keyboardHeight));
    };

    // Initial check
    handleResize();

    visualViewport.addEventListener('resize', handleResize);
    return () => visualViewport.removeEventListener('resize', handleResize);
  }, []);

  return keyboardHeight;
}

/**
 * Hook to detect if the keyboard is currently visible (useful for iOS PWA).
 */
export function useKeyboardVisible(): boolean {
  const keyboardHeight = useKeyboardHeight();
  return keyboardHeight > 100; // Threshold to avoid false positives
}