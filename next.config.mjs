const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "pdfjs-dist", "unpdf"],
  outputFileTracingIncludes: {
    "/api/r2/normalize": [
      "./node_modules/pdfjs-dist/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*"
    ]
  }
};

export default nextConfig;
