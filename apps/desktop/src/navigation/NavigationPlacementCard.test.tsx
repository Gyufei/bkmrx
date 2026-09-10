// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationPlacementId } from '@/test-utils/identity';
import NavigationPlacementCard from './NavigationPlacementCard';

describe('NavigationPlacementCard favicon', () => {
  afterEach(cleanup);

  it('loads the site favicon lazily and falls back when it fails', () => {
    const bookmark = {
      placement_id: navigationPlacementId(1),
      bookmark_id: bookmarkId(1),
      title: 'Docs',
      url: 'https://example.com/page',
      created_at: 1,
    };
    const { container } = render(
      <NavigationPlacementCard
        card={bookmark}
        removing={false}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://example.com/favicon.ico');
    expect(image).toHaveAttribute('loading', 'lazy');
    fireEvent.error(image);
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
