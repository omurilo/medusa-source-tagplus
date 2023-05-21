import { Logger } from "@medusajs/medusa/dist/types/global";
import formatRegistrationName from "@medusajs/medusa/dist/utils/format-registration-name";
import { BatchJobService, StoreService, TransactionBaseService } from "@medusajs/medusa";
import axios, { AxiosInstance, AxiosResponse, Method } from "axios";
import { EntityManager } from "typeorm";
import { MedusaError } from "medusa-core-utils";
import { TagPlusStore } from "../strategies/import";
import { Categories, Category, Product, ProductImage, Products } from "../utils/tagplus.types";

type InjectedDependencies = {
	manager: EntityManager;
	logger: Logger;
	storeService: StoreService;
	batchJobService: BatchJobService;
};

export type PluginOptions = {
	apiVersion: string;
	apiUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
};

export type AuthorizeResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: string;
	token_type: string;
};

class TagPlusClientService extends TransactionBaseService {
	static readonly RESOLVE_KEY = formatRegistrationName(`${process.cwd()}/services/tagplus.client.js`);
	protected logger_: Logger;
	protected storeService_: StoreService;
	protected apiBaseUrl_: string;
	protected backJobService: BatchJobService;

	protected options_: PluginOptions;
	protected client_: AxiosInstance;

	constructor(container: InjectedDependencies, options) {
		super(container);
		this.manager_ = container.manager;
		this.logger_ = container.logger;
		this.storeService_ = container.storeService;
		this.options_ = options;
		this.apiBaseUrl_ = `${options.apiUrl}`;
		this.backJobService = container.batchJobService;

		this.client_ = axios.create({
			headers: {
				Accept: "application/json",
				"X-Api-Version": `${options.apiVersion}`,
			},
		});

		this.client_.interceptors.request.use(null, (error) => {
			console.log(error);
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				error.response?.data?.message ||
					error.request?.data?.message ||
					error.message ||
					"An error occurred while sending the request."
			);
		});

		this.client_.interceptors.response.use(null, (error) => {
			console.log(error);
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				error.response?.data?.message ||
					error.request?.data?.message ||
					error.message ||
					"An error occurred while sending the request."
			);
		});
	}

	async retrieveProducts(page = 1, perPage = 100) {
		const queries = this.formatQueryString({
			page,
			perPage,
			ativo: 1,
			sincroniza: 1,
			sort: "-data_alteracao",
			fields: [
				"ativo",
				"sincroniza",
				"codigo",
				"codigo_grade",
				"codigo_barras",
				"descricao",
				"descricao_curta",
				"descricao_longa",
				"estoque",
				"categoria",
				"data_alteracao",
				"data_validade",
				"imagem_principal",
				"imagens",
				"peso",
				"largura",
				"altura",
				"comprimento",
				"valores_venda",
			].join(","),
		});
		return this.sendRequest<any, Products>(`/produtos?${queries}`);
	}

	async retrieveProduct(productId?: string) {
		return this.sendRequest<any, Product>(`/produtos/${productId}`);
	}

	async retrieveProductImages(productId?: string) {
		return this.sendRequest<any, ProductImage[]>(`/produtos/imagens/${productId}`);
	}

	// async retrieveInventoryData(sku: string): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/stockItems/${sku}`);
	// }

	// async retrieveSimpleProductsAsVariants(productIds: string[]): Promise<Record<string, any>[]> {
	// 	return this.retrieveProducts().then(async ({ data: products }) => {
	// 		return await Promise.all(
	// 			products.map(async (variant) => {
	// 				//get stock item of that variant
	// 				const { data } = await this.retrieveInventoryData(variant.sku);

	// 				return {
	// 					...variant,
	// 					stockData: data,
	// 				};
	// 			})
	// 		);
	// 	});
	// }

	async retrieveCategories() {
		return this.sendRequest<any, Categories>(`/categorias?fields=*`);
	}

	async retrieveCategory(categoryID?: number) {
		return this.sendRequest<any, Category>(`/categorias/${categoryID}`);
	}

	// async retrieveOptionsDefaults(): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/product_options/`);
	// }

	// async retrieveOptionsValues(): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/product_option_values/`);
	// }

	// async retrieveOptionValues(optionId?: string): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/product_option_values/${optionId}`);
	// }

	// async retrieveStockValues(stockId?: string): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/stock_availables/${stockId}`);
	// }

	// async retrieveCombinationValues(combinationId?: string): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/combinations/${combinationId}`);
	// }

	// async retrieveOption(optionId?: string): Promise<AxiosResponse<any>> {
	// 	return this.sendRequest(`/product_options/${optionId}`);
	// }

	async storeToken(tokenObject: AuthorizeResponse) {
		const store: TagPlusStore = await this.storeService_.retrieve();
		await this.storeService_.update({
			metadata: {
				tagplus: {
					...(store.metadata?.tagplus ?? {}),
					accessToken: tokenObject.access_token,
					refreshToken: tokenObject.refresh_token,
					expiresAt: new Date().getTime() + Number(tokenObject.expires_in) * 1000,
				},
			},
		});
	}

	async authorize(code: string) {
		console.log("Trying authorize");
		const { data } = await this.sendRequest<string, AuthorizeResponse>(
			"/oauth2/token",
			"POST",
			`grant_type=authorization_code&code=${code}&client_id=${this.options_.clientId}&client_secret=${this.options_.clientSecret}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);

		await this.storeToken(data);

		return data;
	}

	async refreshToken() {
		const store: TagPlusStore = await this.storeService_.retrieve();

		if (!store) return;

		const refreshToken = store.metadata.tagplus?.refreshToken;

		if (!refreshToken) return;

		const { data } = await this.sendRequest<string, AuthorizeResponse>(
			`/oauth2/token`,
			"POST",
			`grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${this.options_.clientId}&client_secret=${this.options_.clientSecret}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);

		await this.storeToken(data);

		return data;
	}

	async verifyAuthorization() {
		const store: TagPlusStore = await this.storeService_.retrieve();

		if (!store) return;

		let accessToken = store.metadata.tagplus?.accessToken;
		let expiresAt = store.metadata.tagplus?.expiresAt;
		let refreshToken = store.metadata.tagplus?.refreshToken;

		if ((!accessToken || Number(expiresAt) < Date.now()) && refreshToken) {
			const accessTokenObject = await this.refreshToken();

			accessToken = accessTokenObject.access_token;
			expiresAt = new Date().getTime() + Number(accessTokenObject.expires_in) * 1000;
		}

		if (accessToken) {
			this.client_.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
		}

		return { isAuthorized: Number(expiresAt) > Date.now(), accessToken };
	}

	formatQueryString(queries: Record<string, any>) {
		return Object.entries(queries)
			.map(([key, value]) => `${key}=${value}`)
			.join("&");
	}

	async sendRequest<Data = any, TResponse = any>(
		path: string,
		method: Method = "GET",
		data?: Data,
		headers?: Record<string, string>
	): Promise<AxiosResponse<TResponse>> {
		await this.verifyAuthorization();
		return this.client_.request({
			url: `${this.apiBaseUrl_}${path}`,
			method,
			data,
			headers,
		});
	}

	async syncProducts() {
		console.log("Creating batch job to import tagplus products...");
		await this.backJobService.create({
			type: "import-tagplus",
			context: {
				options: this.options_,
			},
			created_by: "Admin",
			dry_run: false,
		});
	}
}

export default TagPlusClientService;
