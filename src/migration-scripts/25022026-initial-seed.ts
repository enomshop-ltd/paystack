import { MedusaContainer } from "@medusajs/framework";
import {
    ContainerRegistrationKeys,
    ModuleRegistrationName,
    Modules,
} from "@medusajs/framework/utils";
import {
    createDefaultsWorkflow,
    createRegionsWorkflow,
    createShippingOptionsWorkflow,
    createShippingProfilesWorkflow,
    createStockLocationsWorkflow,
    createTaxRegionsWorkflow,
    linkSalesChannelsToStockLocationWorkflow,
    updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";


export default async function migration_25022026_initial_seed({
    container,
}: {
    container: MedusaContainer;
}) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const link = container.resolve(ContainerRegistrationKeys.LINK);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const storeModuleService = container.resolve(ModuleRegistrationName.STORE);
    const salesChannelModuleService = container.resolve(ModuleRegistrationName.SALES_CHANNEL);
    const fulfillmentModuleService = container.resolve(
        ModuleRegistrationName.FULFILLMENT
    );

    const { data: existingProductsAtStartup } = await query.graph({
        entity: "product",
        fields: ["id"],
    });

    // If we want to explicitly not seed data, or if it's an existing project with data seeded in a different way, skip the seeding.
    if (process.env.SKIP_INITIAL_SEED === "true" || existingProductsAtStartup.length > 0) {
        return
    }

    logger.info("Seeding defaults...");
    await createDefaultsWorkflow(container).run();

    const [store] = await storeModuleService.listStores();
    let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
    });


    await updateStoresWorkflow(container).run({
        input: {
            selector: { id: store.id },
            update: {
                supported_currencies: [
                    { currency_code: "usd", is_default: true },
                    { currency_code: "eur", is_tax_inclusive: true },
                ],
                default_sales_channel_id: defaultSalesChannel[0].id,
            },
        },
    });

    const { data: pricePreferences } = await query.graph({
        entity: "price_preference",
        fields: ["id"],
    });

    if (pricePreferences.length > 0) {
        const ids = pricePreferences.map((pp) => pp.id);
        await container.resolve(Modules.PRICING).deletePricePreferences(ids);
    }

    const europeanCountries = ["gb", "de", "dk", "se", "fr", "es", "it"];
    const { data: existingRegions } = await query.graph({
        entity: "region",
        fields: ["id", "name"],
    });

    let usRegion;
    let europeRegion;
    if (!existingRegions.length) {
        logger.info("Creating regions...");
        const { result: regionResult } = await createRegionsWorkflow(container).run(
            {
                input: {
                    regions: [
                        {
                            name: "US",
                            currency_code: "usd",
                            countries: ["us"],
                            payment_providers: ["pp_system_default"],
                            automatic_taxes: false,
                            is_tax_inclusive: false,
                        },
                        {
                            name: "Europe",
                            currency_code: "eur",
                            countries: europeanCountries,
                            payment_providers: ["pp_system_default"],
                            automatic_taxes: true,
                            is_tax_inclusive: true,
                        },
                    ],
                },
            }
        );
        usRegion = regionResult[0];
        europeRegion = regionResult[1];
    } else {
        logger.info("Regions already exist, skipping creation...");
        usRegion = existingRegions.find((r) => r.name === "US");
        europeRegion = existingRegions.find((r) => r.name === "Europe");
    }

    const { data: existingTaxRegions } = await query.graph({
        entity: "tax_region",
        fields: ["id", "name"],
    });

    if (!existingTaxRegions.length) {
        logger.info("Seeding tax regions...");
        const taxRates: Record<string, { rate: number; code: string; name: string }> =
        {
            gb: { rate: 20, code: "GB20", name: "UK VAT" },
            de: { rate: 19, code: "DE19", name: "Germany VAT" },
            dk: { rate: 25, code: "DK25", name: "Denmark VAT" },
            se: { rate: 25, code: "SE25", name: "Sweden VAT" },
            fr: { rate: 20, code: "FR20", name: "France VAT" },
            es: { rate: 21, code: "ES21", name: "Spain VAT" },
            it: { rate: 22, code: "IT22", name: "Italy VAT" },
        };

        await createTaxRegionsWorkflow(container).run({
            input: Object.entries(taxRates).map(([country_code, taxConfig]) => {
                return {
                    country_code,
                    provider_id: "tp_system",
                    default_tax_rate: {
                        rate: taxConfig.rate,
                        code: taxConfig.code,
                        name: taxConfig.name,
                        is_default: true,
                    },
                };
            }),
        });

        logger.info("Finished seeding tax regions.");
    } else {
        logger.info("Tax regions already exist, skipping creation...");
    }


    const { data: existingStockLocations } = await query.graph({
        entity: "stock_location",
        fields: ["id", "name"],
    });

    let stockLocation;
    if (!existingStockLocations.length) {
        logger.info("Seeding stock location data...");
        const { result: stockLocationResult } = await createStockLocationsWorkflow(
            container
        ).run({
            input: {
                locations: [
                    {
                        name: "Main Warehouse",
                        address: {
                            city: "",
                            country_code: "US",
                            address_1: "",
                        },
                    },
                ],
            },
        });
        stockLocation = stockLocationResult[0];

        await link.create({
            [Modules.STOCK_LOCATION]: {
                stock_location_id: stockLocation.id,
            },
            [Modules.FULFILLMENT]: {
                fulfillment_provider_id: "manual_manual",
            },
        });
    } else {
        logger.info("Stock location already exists, skipping creation...");
        stockLocation = existingStockLocations[0];
    }


    const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
        type: "default",
    });
    let shippingProfile;

    if (!shippingProfiles.length) {
        logger.info("Creating shipping profile...");
        const { result: shippingProfileResult } =
            await createShippingProfilesWorkflow(container).run({
                input: {
                    data: [
                        {
                            name: "Default Shipping Profile",
                            type: "default",
                        },
                    ],
                },
            });
        shippingProfile = shippingProfileResult[0];
    } else {
        logger.info("Shipping profile already exists, skipping creation...");
        shippingProfile = shippingProfiles[0];
    }

    const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets();

    let fulfillmentSet;
    if (!fulfillmentSets.length) {
        logger.info("Creating fulfillment set...");
        fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
            name: "Main Warehouse Delivery",
            type: "shipping",
            service_zones: [
                {
                    name: "Worldwide",
                    geo_zones: ["us", ...europeanCountries].map((country_code) => ({
                        country_code,
                        type: "country" as const,
                    })),
                },
            ],
        });

        await link.create({
            [Modules.STOCK_LOCATION]: {
                stock_location_id: stockLocation.id,
            },
            [Modules.FULFILLMENT]: {
                fulfillment_set_id: fulfillmentSet.id,
            },
        });
    } else {
        logger.info("Fulfillment set already exists, skipping creation...");
        fulfillmentSet = fulfillmentSets[0];
    }


    const { data: existingShippingOptions } = await query.graph({
        entity: "shipping_option",
        fields: ["id", "name"],
    });

    if (!existingShippingOptions.length) {
        logger.info("Creating shipping option...");
        await createShippingOptionsWorkflow(container).run({
            input: [
                {
                    name: "Standard Worldwide Shipping",
                    price_type: "flat",
                    provider_id: "manual_manual",
                    service_zone_id: fulfillmentSet.service_zones[0].id,
                    shipping_profile_id: shippingProfile.id,
                    type: {
                        label: "Standard",
                        description: "Ships worldwide",
                        code: "standard-worldwide",
                    },
                    prices: [
                        {
                            currency_code: "usd",
                            amount: 10,
                        },
                        {
                            currency_code: "eur",
                            amount: 10,
                        },
                    ],
                    rules: [
                        {
                            attribute: "enabled_in_store",
                            value: "true",
                            operator: "eq",
                        },
                        {
                            attribute: "is_return",
                            value: "false",
                            operator: "eq",
                        },
                    ],
                },
            ],
        });
    } else {
        logger.info("Shipping option already exists, skipping creation...");
    }

    await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
            id: stockLocation.id,
            add: [defaultSalesChannel[0].id],
        },
    });

    logger.info("Finished seeding data.");
}