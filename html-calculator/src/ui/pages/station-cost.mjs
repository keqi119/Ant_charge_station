import { renderControl } from "../controls.mjs";
import { card, money, pageHeader } from "./page-utils.mjs";

const TYPE_LABELS = Object.freeze({ twoGun: "2枪站", fourGun: "4枪站" });
const FIELD_LABELS = Object.freeze({ equipment: "设备成本", engineering: "工程施工及辅材", channel: "渠道公关费用" });

export function render(container, { snapshot, actions }) {
  container.replaceChildren();
  pageHeader(container, "单站成本", "租赁物原值包含设备与工程；渠道费用由股东资金承担。", snapshot.result.status);
  const grid = document.createElement("div");
  grid.className = "cost-card-grid";
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    const section = card(label, type === "twoGun" ? "2枪＋120kW功率堆" : "4枪＋160kW功率堆");
    const controls = document.createElement("div");
    controls.className = "control-grid one-column";
    const cost = snapshot.draft.assumptions.costByStationType[type];
    for (const [field, fieldLabel] of Object.entries(FIELD_LABELS)) {
      const path = `assumptions.costByStationType.${type}.${field}`;
      controls.append(renderControl({
        id: path.replaceAll(".", "-"), path, label: fieldLabel, type: "number", unit: "元/站",
        value: cost[field], min: 0, step: 1000,
        error: snapshot.validation.errors.find((row) => row.path === path)?.message,
        onChange: (value) => actions.update(path, value),
      }));
    }
    const total = cost.equipment + cost.engineering + cost.channel;
    const eligible = cost.equipment + cost.engineering;
    const output = document.createElement("div");
    output.className = "cost-summary";
    output.innerHTML = `<span>单站总成本<strong>¥${money.format(total)}</strong></span><span>可融资原值<strong>¥${money.format(eligible)}</strong></span><span>股东承担渠道费<strong>¥${money.format(cost.channel)}</strong></span>`;
    section.append(controls, output);
    grid.append(section);
  }
  container.append(grid);
  const demolition = card("拆站后的成本处理", "设备可拆卸并在新址二次利用，不重复购置；原址工程与渠道费用成为沉没成本，新址迁建需重新投入工程及渠道费用，且不计入原融资租赁放款。");
  demolition.innerHTML += `<div class="cost-summary"><span>预计拆站规模<strong>${money.format(snapshot.result.kpis.expectedDemolishedStations)}站</strong></span><span>可复用设备原值<strong>¥${money.format(snapshot.result.kpis.reusableEquipmentValue)}</strong></span><span>迁建追加投入<strong>¥${money.format(snapshot.result.kpis.relocationCapex)}</strong></span></div>`;
  container.append(demolition);
  return () => {};
}
