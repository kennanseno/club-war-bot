import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from './utils.js';

export function deferInteractionResponse(res, flags) {
  res.locals.interactionDeferred = true;
  return res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags },
  });
}

export function editDeferredInteractionResponse(
  appId,
  token,
  content,
  request = DiscordRequest,
) {
  return request(`webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: { parse: [] },
    },
  });
}
