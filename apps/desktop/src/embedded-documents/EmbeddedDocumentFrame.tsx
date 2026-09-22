import { useCallback, useEffect, useRef } from 'react';
import { open as openExternal } from '@tauri-apps/plugin-shell';

export type EmbeddedDocumentSource =
  { kind: 'remote'; url: string } | { kind: 'trusted-html'; html: string };

export type EmbeddedDocumentRuntimeError =
  | { kind: 'invalid-source' }
  | { kind: 'document-access-denied' }
  | { kind: 'external-navigation-failed'; url: string };

interface EmbeddedDocumentFrameProps {
  source: EmbeddedDocumentSource;
  title: string;
  className?: string;
  onLoad?: () => void;
  onRuntimeError?: (error: EmbeddedDocumentRuntimeError) => void;
}

const RUNTIME_SANDBOX = 'allow-scripts allow-forms allow-same-origin';
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function decodeFragment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isApprovedRemoteUrl(url: string) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export default function EmbeddedDocumentFrame({
  source,
  title,
  className,
  onLoad,
  onRuntimeError,
}: EmbeddedDocumentFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const removeNavigationListenerRef = useRef<(() => void) | null>(null);
  const invalidSource = source.kind === 'remote' && !isApprovedRemoteUrl(source.url);

  useEffect(() => {
    if (invalidSource) onRuntimeError?.({ kind: 'invalid-source' });
  }, [invalidSource, onRuntimeError]);

  useEffect(
    () => () => {
      removeNavigationListenerRef.current?.();
    },
    [],
  );

  const handleLoad = useCallback(() => {
    removeNavigationListenerRef.current?.();
    removeNavigationListenerRef.current = null;
    if (source.kind === 'trusted-html') {
      const document = iframeRef.current?.contentDocument;
      if (!document) {
        onRuntimeError?.({ kind: 'document-access-denied' });
        return;
      }
      const handleClick = (event: MouseEvent) => {
        const target = event.target;
        if (!target || (target as Node).nodeType !== Node.ELEMENT_NODE) return;
        const anchor = (target as Element).closest<HTMLAnchorElement>('a[href]');
        if (!anchor) return;
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;
        if (rawHref.startsWith('#')) {
          event.preventDefault();
          const targetId = decodeFragment(rawHref.slice(1));
          const fragmentTarget =
            document.getElementById(targetId) ?? document.getElementsByName(targetId)[0];
          if (fragmentTarget && 'scrollIntoView' in fragmentTarget) {
            fragmentTarget.scrollIntoView();
          }
          return;
        }
        event.preventDefault();
        let url: URL;
        try {
          url = new URL(rawHref);
        } catch {
          return;
        }
        if (!EXTERNAL_PROTOCOLS.has(url.protocol)) return;
        void openExternal(url.href).catch(() => {
          onRuntimeError?.({ kind: 'external-navigation-failed', url: url.href });
        });
      };
      document.addEventListener('click', handleClick, true);
      removeNavigationListenerRef.current = () =>
        document.removeEventListener('click', handleClick, true);
    }
    onLoad?.();
  }, [onLoad, onRuntimeError, source.kind]);

  if (invalidSource) return null;

  return (
    <iframe
      ref={iframeRef}
      title={title}
      src={source.kind === 'remote' ? source.url : undefined}
      srcDoc={source.kind === 'trusted-html' ? source.html : undefined}
      sandbox={RUNTIME_SANDBOX}
      className={className}
      onLoad={handleLoad}
    />
  );
}
