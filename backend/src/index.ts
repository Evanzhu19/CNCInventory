import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  const hostForDisplay = env.HOST === "0.0.0.0" ? "localhost" : env.HOST;
  console.log(`API server listening on http://${hostForDisplay}:${env.PORT}`);
});
