import { wrapHandler } from "@medusajs/medusa";
import authenticate from "@medusajs/medusa/dist/api/middlewares/authenticate";
import { Router } from "express";
import { getConfigFile } from "medusa-core-utils";
import { ConfigModule } from "@medusajs/medusa/dist/types/global";
import * as cors from "cors";
import { authorizeHandler } from "./handlers/authorize";
import { oauth2Callback } from "./handlers/oauth2-callback";
import { syncProducts } from "./handlers/sync-products";
import { verifyAuthorization } from "./handlers/verify";
import { refreshToken } from "./handlers/refresh-token";

export default (rootDirectory, options) => {
	// options contain the plugin configurations
	const router = Router();

	const { configModule } = getConfigFile<ConfigModule>(rootDirectory, "medusa-config");
	const { projectConfig } = configModule;

	const corsOptions = {
		origin: projectConfig.admin_cors.split(","),
		credentials: true,
	};

	router.get("/admin/tagplus/oauth2", wrapHandler(oauth2Callback));

	router.options("/admin/tagplus/*", cors(corsOptions));
	router.use("/admin/tagplus/*", authenticate());
	router.get("/admin/tagplus/authorize", cors(corsOptions), wrapHandler(authorizeHandler(options)));
	router.get("/admin/tagplus/verify", cors(corsOptions), wrapHandler(verifyAuthorization));
	router.get("/admin/tagplus/refresh", cors(corsOptions), wrapHandler(refreshToken));
	router.post("/admin/tagplus/sync-products", cors(corsOptions), wrapHandler(syncProducts));

	return router;
};
