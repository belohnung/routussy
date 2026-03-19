import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";

const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || "3000"}`;

const MODELS: Record<string, object> = {
  "glm-4.5": {
    name: "GLM-4.5",
    tool_call: true,
    reasoning: true,
    attachment: false,
    temperature: true,
    cost: { input: 0.6, output: 2.2, cache_read: 0.11 },
    limit: { context: 131072, output: 98304 },
  },
  "glm-4.5-air": {
    name: "GLM-4.5-Air",
    tool_call: true,
    reasoning: true,
    attachment: false,
    temperature: true,
    cost: { input: 0.2, output: 1.1, cache_read: 0.03 },
    limit: { context: 131072, output: 98304 },
  },
  "glm-4.6": {
    name: "GLM-4.6",
    tool_call: true,
    reasoning: true,
    attachment: false,
    temperature: true,
    cost: { input: 0.6, output: 2.2, cache_read: 0.11 },
    limit: { context: 204800, output: 131072 },
  },
  "glm-4.7": {
    name: "GLM-4.7",
    tool_call: true,
    reasoning: true,
    interleaved: { field: "reasoning_content" },
    attachment: false,
    temperature: true,
    cost: { input: 0.6, output: 2.2, cache_read: 0.11 },
    limit: { context: 204800, output: 131072 },
  },
  "glm-5": {
    name: "GLM-5",
    tool_call: true,
    reasoning: true,
    interleaved: { field: "reasoning_content" },
    attachment: false,
    temperature: true,
    cost: { input: 1.0, output: 3.2, cache_read: 0.2 },
    limit: { context: 204800, output: 131072 },
  },
  "glm-5-turbo": {
    name: "GLM-5-Turbo",
    tool_call: true,
    reasoning: true,
    interleaved: { field: "reasoning_content" },
    attachment: false,
    temperature: true,
    cost: { input: 1.2, output: 4.0, cache_read: 0.24 },
    limit: { context: 200000, output: 131072 },
  },
};

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Get the opencode provider snippet for this proxy");

export async function execute(interaction: ChatInputCommandInteraction) {
  const snippet = JSON.stringify(
    {
      routussy: {
        api: `${PUBLIC_URL}/v1`,
        models: MODELS,
      },
    },
    null,
    2
  );

  await interaction.reply({
    content: `Add to \`provider\` in \`opencode.json\`:\n\`\`\`json\n${snippet}\n\`\`\`\nSet \`ROUTUSSY_API_KEY\` in your env. Use as \`routussy/glm-5\`, etc.`,
    flags: MessageFlags.Ephemeral,
  });
}
