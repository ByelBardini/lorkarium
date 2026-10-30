import type { AssetDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { assetUrlOf } from '@/services/assets-api';

export type ImageView = Readonly<{ name: string; asset: AssetDto }>;

/** Shared complete-image preview with recoverable loading errors. Example: `<ImageViewer image={image} />`. */
export function ImageViewer({ image }: Readonly<{ image: ImageView }>): React.JSX.Element {
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
      {status === 'loading' && <p role="status">Carregando imagem…</p>}
      {status === 'failed' && (
        <>
          <p role="alert">Não deu para carregar a imagem.</p>
          <Button
            onClick={() => {
              setStatus('loading');
              retry(attempt + 1);
            }}
          >
            Tentar de novo
          </Button>
        </>
      )}
      <img
        key={attempt}
        src={`${assetUrlOf(image.asset.id)}${attempt ? `?retry=${attempt}` : ''}`}
        alt={image.name}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('failed')}
        className="min-h-0 max-w-full flex-1 object-contain"
        hidden={status === 'failed'}
      />
    </div>
  );
}

/** Local preview and remote presentation share the accessible dialog. Example: `<ImageViewerModal image={image} onClose={close} />`. */
export function ImageViewerModal({
  image,
  onClose,
}: Readonly<{ image: ImageView; onClose: () => void }>): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85svh] max-w-[calc(100%-2rem)] flex-col sm:max-w-[1100px]"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogTitle>{image.name}</DialogTitle>
        <DialogDescription className="sr-only">Imagem da biblioteca da mesa</DialogDescription>
        <ImageViewer key={image.asset.id} image={image} />
        <Button variant="outline" className="self-end" onClick={onClose}>
          Fechar imagem
        </Button>
      </DialogContent>
    </Dialog>
  );
}
