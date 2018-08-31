'use strict';

module.exports = {
  LaunchIntent: 'spellRequest',
  WelcomeIntent: 'spellRequest',
  YesIntent: 'spellRequest',
  NoIntent: 'StopIntent',
  CancelIntent: 'StopIntent',
  'AMAZON.YesIntent': 'spellRequest',
  'AMAZON.NoIntent': 'StopIntent',
  'AMAZON.NextIntent': 'NextIntent',
  'AMAZON.PreviousIntent': 'PreviousIntent',
  'AMAZON.StartOverIntent': 'StartOverIntent',
  'AMAZON.RepeatIntent': 'RepeatIntent',
  'AMAZON.HelpIntent': 'HelpIntent',
  'AMAZON.StopIntent': 'StopIntent',
  'AMAZON.CancelIntent': 'StopIntent',
  'AMAZON.FallbackIntent': 'Unhandled',
  DefaultFallbackIntent: 'Unhandled',
};
