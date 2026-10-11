const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const eventImpact = (event) => event.event_type === "fee_credit" ? amount(event.amount) : -amount(event.amount);

export const buildOperationalProfitability = ({ acquisitions = [], items = [], movements = [], sales = [], returns = [], orders = [] }) => {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const acquiredUnitsByAcquisition = new Map();
  for (const movement of movements) {
    if (movement.movement_type !== "receipt" || amount(movement.quantity) <= 0) continue;
    const acquisitionId = itemById.get(movement.inventory_item_id)?.acquisition_id;
    if (acquisitionId) acquiredUnitsByAcquisition.set(acquisitionId, (acquiredUnitsByAcquisition.get(acquisitionId) ?? 0) + amount(movement.quantity));
  }
  const acquisitionRows = acquisitions.map((acquisition) => {
    const landedCost = amount(acquisition.purchase_price) + amount(acquisition.inbound_freight) + amount(acquisition.buyers_premium) + amount(acquisition.acquisition_tax);
    const acquiredUnits = acquiredUnitsByAcquisition.get(acquisition.id) ?? 0;
    return { ...acquisition, landedCost: roundMoney(landedCost), acquiredUnits, allocatedUnitCost: acquiredUnits > 0 ? landedCost / acquiredUnits : 0 };
  });
  const acquisitionById = new Map(acquisitionRows.map((entry) => [entry.id, entry]));
  const saleRows = sales.map((sale) => {
    const item = itemById.get(sale.item_id);
    const acquisition = acquisitionById.get(item?.acquisition_id);
    const quantity = Math.max(1, amount(sale.quantity));
    const gross = amount(sale.sold_price);
    const directCosts = amount(sale.fees) + amount(sale.shipping_cost);
    const acquisitionCost = amount(acquisition?.allocatedUnitCost) * quantity;
    return { ...sale, item, acquisitionId: item?.acquisition_id ?? null, quantity, gross, directCosts, acquisitionCost, estimatedProfitBeforeReturns: gross - directCosts - acquisitionCost };
  });
  const returnRows = returns.map((returnEntry) => {
    const financialImpact = (returnEntry.return_financial_events ?? []).reduce((sum, event) => sum + eventImpact(event), 0);
    const lines = (returnEntry.return_lines ?? []).map((line) => ({ ...line, quantity: Math.max(1, amount(line.quantity)), inventoryItemId: line.order_lines?.inventory_item_id ?? line.inventory_item_id ?? null }));
    const acquisitionIds = [...new Set(lines.map((line) => itemById.get(line.inventoryItemId)?.acquisition_id).filter(Boolean))];
    return { ...returnEntry, return_lines: lines, financialImpact, acquisitionIds };
  });
  const returnImpactByAcquisition = new Map();
  for (const row of returnRows) {
    if (row.acquisitionIds.length !== 1) continue;
    const acquisitionId = row.acquisitionIds[0];
    returnImpactByAcquisition.set(acquisitionId, (returnImpactByAcquisition.get(acquisitionId) ?? 0) + row.financialImpact);
  }
  const performanceByAcquisition = acquisitionRows.map((acquisition) => {
    const relatedSales = saleRows.filter((sale) => sale.acquisitionId === acquisition.id);
    const grossRevenue = relatedSales.reduce((sum, sale) => sum + sale.gross, 0);
    const directCosts = relatedSales.reduce((sum, sale) => sum + sale.directCosts, 0);
    const allocatedSoldCost = relatedSales.reduce((sum, sale) => sum + sale.acquisitionCost, 0);
    const returnImpact = returnImpactByAcquisition.get(acquisition.id) ?? 0;
    const netCashAfterReturns = grossRevenue - directCosts + returnImpact;
    return {
      id: acquisition.id,
      name: acquisition.name,
      landedCost: acquisition.landedCost,
      acquiredUnits: acquisition.acquiredUnits,
      soldUnits: relatedSales.reduce((sum, sale) => sum + sale.quantity, 0),
      grossRevenue: roundMoney(grossRevenue),
      directCosts: roundMoney(directCosts),
      returnImpact: roundMoney(returnImpact),
      allocatedSoldCost: roundMoney(allocatedSoldCost),
      estimatedProfit: roundMoney(netCashAfterReturns - allocatedSoldCost),
      costRecoveryPercent: acquisition.landedCost > 0 ? roundMoney(netCashAfterReturns / acquisition.landedCost * 100) : null,
    };
  }).sort((left, right) => right.estimatedProfit - left.estimatedProfit);
  const grossRevenue = saleRows.reduce((sum, sale) => sum + sale.gross, 0);
  const directSellingCosts = saleRows.reduce((sum, sale) => sum + sale.directCosts, 0);
  const allocatedSoldCost = saleRows.reduce((sum, sale) => sum + sale.acquisitionCost, 0);
  const returnFinancialImpact = returnRows.reduce((sum, row) => sum + row.financialImpact, 0);
  const soldUnits = saleRows.reduce((sum, sale) => sum + sale.quantity, 0);
  const returnedUnits = returnRows.reduce((sum, row) => sum + row.return_lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const allocatedSoldUnits = saleRows.filter((sale) => amount(acquisitionById.get(sale.acquisitionId)?.acquiredUnits) > 0).reduce((sum, sale) => sum + sale.quantity, 0);
  const returnImpactByItem = new Map();
  for (const row of returnRows) {
    const totalLineUnits = row.return_lines.reduce((sum, line) => sum + line.quantity, 0);
    if (totalLineUnits <= 0) continue;
    for (const line of row.return_lines) {
      if (!line.inventoryItemId) continue;
      returnImpactByItem.set(line.inventoryItemId, (returnImpactByItem.get(line.inventoryItemId) ?? 0) + row.financialImpact * line.quantity / totalLineUnits);
    }
  }
  const itemPerformance = [...new Set(saleRows.map((sale) => sale.item_id))].map((itemId) => {
    const item = itemById.get(itemId);
    const relatedSales = saleRows.filter((sale) => sale.item_id === itemId);
    const quantitySold = relatedSales.reduce((sum, sale) => sum + sale.quantity, 0);
    const grossRevenue = relatedSales.reduce((sum, sale) => sum + sale.gross, 0);
    const directCosts = relatedSales.reduce((sum, sale) => sum + sale.directCosts, 0);
    const allocatedCost = relatedSales.reduce((sum, sale) => sum + sale.acquisitionCost, 0);
    const returnImpact = returnImpactByItem.get(itemId) ?? 0;
    return { id: itemId, name: item?.name ?? "Unknown item", sku: item?.client_id ?? "", category: item?.category ?? "Uncategorized", condition: item?.condition ?? "Unknown", quantitySold, grossRevenue: roundMoney(grossRevenue), directCosts: roundMoney(directCosts), allocatedCost: roundMoney(allocatedCost), returnImpact: roundMoney(returnImpact), estimatedProfit: roundMoney(grossRevenue - directCosts - allocatedCost + returnImpact) };
  }).sort((left, right) => right.estimatedProfit - left.estimatedProfit);
  const projectedAvailableValue = items.reduce((sum, item) => sum + Math.max(0, amount(item.available)) * ((amount(item.low_price) + amount(item.high_price)) / 2), 0);
  const observedOrderSubtotal = orders.filter((order) => String(order.payment_state).toLowerCase() === "paid").reduce((sum, order) => sum + amount(order.pricing_summary?.priceSubtotal?.value ?? order.pricing_summary?.priceSubtotal?.amount), 0);
  return {
    summary: {
      grossRevenue: roundMoney(grossRevenue),
      directSellingCosts: roundMoney(directSellingCosts),
      allocatedSoldCost: roundMoney(allocatedSoldCost),
      returnFinancialImpact: roundMoney(returnFinancialImpact),
      estimatedProfit: roundMoney(grossRevenue - directSellingCosts - allocatedSoldCost + returnFinancialImpact),
      projectedAvailableValue: roundMoney(projectedAvailableValue),
      observedOrderSubtotal: roundMoney(observedOrderSubtotal),
      acquisitionAllocationCoveragePercent: soldUnits > 0 ? roundMoney(allocatedSoldUnits / soldUnits * 100) : 100,
      unallocatedSaleCount: saleRows.filter((sale) => amount(acquisitionById.get(sale.acquisitionId)?.acquiredUnits) <= 0).length,
      soldUnits,
      returnedUnits,
      returnRatePercent: soldUnits > 0 ? roundMoney(returnedUnits / soldUnits * 100) : 0,
    },
    acquisitions: performanceByAcquisition,
    items: itemPerformance,
    sales: saleRows,
    returns: returnRows,
  };
};
