import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { ensureUser, ensureGuild } from "../../db/users";
import { listUserKeys } from "../../keys";
import { AbsoluteQuotaAdapter } from "../../quota";

const quota = new AbsoluteQuotaAdapter();

export const data = new SlashCommandBuilder()
  .setName("my-keys")
  .setDescription("View your API keys and usage");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await ensureGuild(interaction.guildId);
  const userId = await ensureUser(interaction.user.id, interaction.guildId);
  const keys = await listUserKeys(userId);
  const userUsage = await quota.getUserUsage(userId);

  const embed = new EmbedBuilder()
    .setTitle("Your API Keys")
    .setColor(0x5865f2)
    .addFields({
      name: "Account Budget",
      value: `$${(userUsage.budgetCents / 100).toFixed(2)} total | $${(userUsage.spentCents / 100).toFixed(2)} spent | $${(userUsage.remainingCents / 100).toFixed(2)} remaining`,
    });

  if (keys.length === 0) {
    embed.setDescription(
      "You have no API keys. Use `/request-key` to request one."
    );
  } else {
    for (const key of keys) {
      const status = key.active ? "Active" : "Revoked";
      const limit =
        key.spend_limit_cents !== null
          ? `$${(key.spend_limit_cents / 100).toFixed(2)}`
          : "No limit";
      const spent = `$${(key.spent_cents / 100).toFixed(2)}`;

      embed.addFields({
        name: `${key.key_prefix}... - ${key.name}`,
        value: `Status: ${status} | Spent: ${spent} | Key Limit: ${limit}`,
      });
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (keys.length > 0) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("create_key_modal")
        .setLabel("Create New Key")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("manage_keys_menu")
        .setLabel("Manage Keys")
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(row);
  } else {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("create_key_modal")
        .setLabel("Create New Key")
        .setStyle(ButtonStyle.Primary)
    );
    components.push(row);
  }

  await interaction.reply({
    embeds: [embed],
    components,
    flags: MessageFlags.Ephemeral,
  });
}
