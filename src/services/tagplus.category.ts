import TagPlusClientService from "./tagplus.client";
import { ProductCollection, ProductCollectionService, TransactionBaseService } from "@medusajs/medusa";

import { EntityManager } from "typeorm";

type InjectedDependencies = {
	tagplusClientService: TagPlusClientService;
	productCollectionService: ProductCollectionService;
	manager: EntityManager;
};

class TagPlusCategoryService extends TransactionBaseService {
	protected manager_: EntityManager;
	protected transactionManager_: EntityManager;
	protected tagplusClientService_: TagPlusClientService;
	protected productCollectionService_: ProductCollectionService;

	constructor(container: InjectedDependencies) {
		super(container);

		this.manager_ = container.manager;
		this.tagplusClientService_ = container.tagplusClientService;
		this.productCollectionService_ = container.productCollectionService;
	}

	async create(category: any): Promise<void> {
		return this.atomicPhase_(async (manager) => {
			//check if a collection exists for the category
			const existingCollection = await this.productCollectionService_
				.withTransaction(manager)
				.retrieveByHandle(this.getHandle(category.data.category))
				.catch(() => undefined);

			if (existingCollection) {
				return this.update(category, existingCollection);
			}

			//create collection
			const collectionData = this.normalizeCollection(category.data.category);
			await this.productCollectionService_.withTransaction(manager).create(collectionData);
		});
	}

	async update(category: any, existingCollection: ProductCollection): Promise<void> {
		return this.atomicPhase_(async (manager) => {
			const collectionData = this.normalizeCollection(category.data.category);

			const update = {};

			for (const key of Object.keys(collectionData)) {
				if (collectionData[key] !== existingCollection[key]) {
					update[key] = collectionData[key];
				}
			}

			if (Object.values(update).length) {
				await this.productCollectionService_
					.withTransaction(manager)
					.update(existingCollection.id, update);
			}
		});
	}

	normalizeCollection(category: any): any {
		return {
			title: category.name,
			handle: category.link_rewrite,
			metadata: {
				tagplus_id: category.id,
			},
		};
	}

	getHandle(category: any): string {
		return category.link_rewrite || "";
	}
}

export default TagPlusCategoryService;
