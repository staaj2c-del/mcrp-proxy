import app from "./server.js";

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Studio Mongo proxy listening on :${port}`));