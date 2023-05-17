import {
	AbstractBatchJobStrategy,
	BatchJob,
	BatchJobService,
	ProductVariantService,
	Store,
	StoreService,
} from "@medusajs/medusa";

import { EntityManager } from "typeorm";
import { Logger } from "@medusajs/medusa/dist/types/global";
import TagPlusCategoryService from "../services/tagplus.category";
import TagPlusProductService from "../services/tagplus.product";
import TagPlusClientService from "../services/tagplus.client";

interface TagPlusStore extends Store {
	metadata: {
		tagplus?: {
			accessToken?: string;
			refreshToken?: string;
			expiresAt?: number;
			buildTime?: Date;
		}
	}
}

type InjectedDependencies = {
	storeService: StoreService;
	tagplusClientService: TagPlusClientService;
	tagplusCategoryService: TagPlusCategoryService;
	tagplusProductService: TagPlusProductService;
	productVariantService: ProductVariantService;
	logger: Logger;
	manager: EntityManager;
	batchJobService: BatchJobService;
};

class ImportStrategy extends AbstractBatchJobStrategy {
	static identifier = "import-tagplus-strategy";
	static batchType = "import-tagplus";

	protected batchJobService_: BatchJobService;
	protected storeService_: StoreService;
	protected tagplusClientService_: TagPlusClientService;
	protected manager_: EntityManager;
	protected transactionManager_: EntityManager;

	protected tagplusCategoryService_: TagPlusCategoryService;
	protected tagplusProductService_: TagPlusProductService;
	protected productVariantService: ProductVariantService;
	protected logger_: Logger;

	constructor(container: InjectedDependencies) {
		super(container);

		this.manager_ = container.manager;
		this.storeService_ = container.storeService;
		this.tagplusClientService_ = container.tagplusClientService;
		this.tagplusCategoryService_ = container.tagplusCategoryService;
		this.tagplusProductService_ = container.tagplusProductService;
		this.productVariantService = container.productVariantService;
		this.logger_ = container.logger;
		this.batchJobService_ = container.batchJobService;
	}

	async preProcessBatchJob(batchJobId: string): Promise<void> {
		return await this.atomicPhase_(async (transactionManager) => {
			const batchJob = await this.batchJobService_
				.withTransaction(transactionManager)
				.retrieve(batchJobId);

			await this.batchJobService_.withTransaction(transactionManager).update(batchJob, {
				result: {
					progress: 0,
				},
			});
		});
	}

	async processJob(batchJobId: string): Promise<void> {
		const batchJob = await this.batchJobService_.retrieve(batchJobId);

		let store: TagPlusStore;

		try {
			store = await this.storeService_.retrieve();
		} catch (e) {
			this.logger_.info("Skipping TagPlus import since no store is created in Medusa.");
			return;
		}

		this.logger_.info("Importing categories from TagPlus...");
		const lastUpdatedTime = await this.getBuildTime(store);

		//retrieve categories
		// const { data } = await this.tagplusClientService_.retrieveCategories(lastUpdatedTime);
		var categories;
		const getCategories = async () => {
			categories = await this.tagplusClientService_.retrieveCategories(lastUpdatedTime);
		};

		await getCategories();

		// await categories.data.categories.map(async (category) => {
		for await (let category of categories.data.categories) {
			await this.tagplusCategoryService_.create(
				await this.tagplusClientService_.retrieveCategory(category.id)
			);
		}

		if (categories.data.categories.length) {
			this.logger_.info(
				`${categories.data.categories.length} categories have been imported or updated successfully.`
			);
		} else {
			this.logger_.info(`No categories have been imported or updated.`);
		}

		this.logger_.info("Importing products from TagPlus...");

		//retrieve configurable products
		const products = await this.tagplusClientService_.retrieveProducts();

		for (let product of products.data.products) {
			const productData = await this.tagplusClientService_.retrieveProduct(product.id);
			productData.data.product.images = await this.tagplusClientService_.retrieveImages(product.id);

			await this.tagplusProductService_.create(productData);
		}

		if (products.data.products.length) {
			this.logger_.info(
				`${products.data.products.length} products have been imported or updated successfully.`
			);
		} else {
			this.logger_.info(`No products have been imported or updated.`);
		}

		await this.updateBuildTime(store);
	}

	async getBuildTime(store?: TagPlusStore | null): Promise<string | null> {
		let buildtime = null;

		try {
			if (!store) {
				store = await this.storeService_.retrieve();
			}
		} catch {
			return null;
		}

		if (store.metadata?.tagplus.buildTime) {
			buildtime = store.metadata?.tagplus.buildTime;
		}

		if (!buildtime) {
			return null;
		}

		return buildtime;
	}

	async updateBuildTime(store?: TagPlusStore | null): Promise<void> {
		try {
			if (!store) {
				store = await this.storeService_.retrieve();
			}
		} catch {
			return null;
		}

		const payload = {
			metadata: {
				tagplus: {
					...(store.metadata?.tagplus ?? {}),
					buildTime: new Date().toISOString(),
				}
			},
		};

		await this.storeService_.update(payload);
	}

	protected async shouldRetryOnProcessingError(batchJob: BatchJob, err: unknown): Promise<boolean> {
		return true;
	}

	buildTemplate(): Promise<string> {
		throw new Error("Method not implemented.");
	}
}

export default ImportStrategy;
