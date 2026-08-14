import "./globals.css";

export const metadata = {
  title: "CIDEF Bonos Dealers",
  description: "Ingreso documental de operaciones dealer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
