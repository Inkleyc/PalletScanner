type WebBarcodeScannerProps = {
  active: boolean;
  onDetected: (data: string) => void;
  onError: (message: string) => void;
  onReady: () => void;
};

export function WebBarcodeScanner(_props: WebBarcodeScannerProps) {
  return null;
}
