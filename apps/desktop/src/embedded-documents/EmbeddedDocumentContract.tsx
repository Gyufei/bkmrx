import { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';

import EmbeddedDocumentFrame from './EmbeddedDocumentFrame';

const CONTRACT_MESSAGE = 'bkmrx:embedded-document-contract';
const INLINE_HTML = `<!doctype html>
<html>
  <body data-contract-marker="body-ready">
    <a id="fragment-link" href="#target">fragment</a>
    <div id="target">target</div>
    <script>
      document.getElementById('fragment-link').addEventListener('click', event => {
        setTimeout(() => parent.postMessage({
          type: '${CONTRACT_MESSAGE}',
          bodyMarker: document.body.dataset.contractMarker,
          scriptExecuted: true,
          fragmentHandledInsideDocument: event.defaultPrevented
        }, '*'), 0);
      });
      setTimeout(() => document.getElementById('fragment-link').click(), 100);
      try { window.top.location.href = 'https://example.invalid/escape'; } catch (_) {}
    </script>
  </body>
</html>`;

interface InlineResult {
  bodyMarker: string;
  scriptExecuted: boolean;
  fragmentHandledInsideDocument: boolean;
}

export default function EmbeddedDocumentContract() {
  const [inlineResult, setInlineResult] = useState<InlineResult | null>(null);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== CONTRACT_MESSAGE) return;
      setInlineResult({
        bodyMarker: event.data.bodyMarker,
        scriptExecuted: event.data.scriptExecuted,
        fragmentHandledInsideDocument: event.data.fragmentHandledInsideDocument,
      });
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!inlineResult || !remoteLoaded || reported) return;
    setReported(true);
    const success =
      inlineResult.bodyMarker === 'body-ready' &&
      inlineResult.scriptExecuted === true &&
      inlineResult.fragmentHandledInsideDocument === true &&
      window.location.hostname !== 'example.invalid';
    void emit('embedded-runtime-contract-result', {
      success,
      details: { ...inlineResult, remoteLoaded, appUrl: window.location.href },
    });
  }, [inlineResult, remoteLoaded, reported]);

  return (
    <main>
      <EmbeddedDocumentFrame
        title="Inline contract document"
        source={{ kind: 'trusted-html', html: INLINE_HTML }}
      />
      <EmbeddedDocumentFrame
        title="Remote contract document"
        source={{ kind: 'remote', url: 'http://localhost:1420/embedded-runtime-contract.html' }}
        onLoad={() => setRemoteLoaded(true)}
      />
    </main>
  );
}
