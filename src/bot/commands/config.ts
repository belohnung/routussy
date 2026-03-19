import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { listModels, ensurePricing, type ModelSpec } from "../../pricing";

const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || "3000"}`;

function specToProviderModel(spec: ModelSpec): object {
  return {
    name: spec.name,
    tool_call: spec.tool_call,
    reasoning: spec.reasoning,
    attachment: spec.attachment,
    temperature: spec.temperature,
    ...(spec.interleaved ? { interleaved: spec.interleaved } : {}),
    cost: spec.cost,
    limit: spec.limit,
  };
}

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Get the opencode provider snippet for this proxy");

export async function execute(interaction: ChatInputCommandInteraction) {
  await ensurePricing();

  const models: Record<string, object> = {};
  for (const [id, spec] of listModels()) {
    models[id] = specToProviderModel(spec);
  }

  const snippet = JSON.stringify(
    { routussy: { api: `${PUBLIC_URL}/v1`, models } },
    null,
    2
  );

  // discord message limit is 2000 chars - if the snippet is too long, attach as file
  if (snippet.length > 1800) {
    const file = new Blob([snippet], { type: "application/json" });
    await interaction.reply({
      content: "Add this to your `provider` block in `opencode.json`.\nSet `ROUTUSSY_API_KEY` in your env. Use as `routussy/<model>`.",
      files: [{ attachment: Buffer.from(snippet), name: "routussy-provider.json" }],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: `Add to \`provider\` in \`opencode.json\`:\n\`\`\`json\n${snippet}\n\`\`\`\nSet \`ROUTUSSY_API_KEY\` in your env. Use as \`routussy/<model>\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
