import QRCode from "qrcode";

export async function toSvgString(text: string, size = 240): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#29263F", light: "#FFFFFF" },
  });
}

export async function toDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#29263F", light: "#FFFFFF" },
  });
}
