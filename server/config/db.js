import mongoose from "mongoose";
import dns from "node:dns";

// ── DNS resolver guard ───────────────────────────────────────────────────────
// On some Windows machines, Node's bundled c-ares resolver fails to enumerate
// the system DNS servers and falls back to 127.0.0.1, where nothing is listening.
// This breaks the mongodb+srv:// SRV lookup with `querySrv ECONNREFUSED` even
// though the OS DNS (and nslookup) work fine. If the active resolver is missing
// or the dead loopback fallback, point Node at public resolvers so SRV/TXT
// lookups succeed. Correctly-configured hosts (incl. production) are untouched.
// Override the list with DNS_SERVERS="1.1.1.1,8.8.8.8" if needed.
{
  const current = dns.getServers();
  const isBrokenFallback =
    current.length === 0 ||
    current.every((s) => s === "127.0.0.1" || s === "::1");
  if (isBrokenFallback) {
    const servers = (process.env.DNS_SERVERS || "1.1.1.1,8.8.8.8")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    dns.setServers(servers);
    console.log(`[db] Node DNS resolver was ${JSON.stringify(current)}; overrode to ${JSON.stringify(servers)}`);
  }
}

export const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("[db] MONGO_URI is not set. Configure it in the environment before starting.");
    process.exit(1);
  }

  // Production resilience: log connection lifecycle so transient Atlas drops are
  // visible. Mongoose auto-reconnects; these handlers are diagnostic only.
  mongoose.connection.on("error",        (err) => console.error("[db] MongoDB connection error:", err.message));
  mongoose.connection.on("disconnected", ()    => console.warn("[db] MongoDB disconnected"));
  mongoose.connection.on("reconnected",  ()    => console.log("[db] MongoDB reconnected"));

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Fail fast on an unreachable cluster instead of hanging the boot.
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("[db] Initial MongoDB connection failed:", error.message);
    process.exit(1);
  }
};