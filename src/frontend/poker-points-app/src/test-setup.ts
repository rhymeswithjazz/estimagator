import '@testing-library/jest-dom';
import { afterEach } from 'vitest';

// Clean up after each test
afterEach(() => {
  document.body.innerHTML = '';
});
