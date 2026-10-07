export type WebCapturedPhoto = {
  base64: string;
  height: number;
  type: "image";
  uri: string;
  width: number;
};

type WebPhotoCameraProps = {
  active: boolean;
  guidance: string;
  onCancel: () => void;
  onCapture: (photo: WebCapturedPhoto) => void;
};

export function WebPhotoCamera(_props: WebPhotoCameraProps) {
  return null;
}
