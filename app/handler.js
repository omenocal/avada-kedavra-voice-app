'use strict';

const _ = require('lodash');
const universalAnalytics = require('universal-analytics');

const config = require('./config');
const alexaSounds = require('./sounds/alexaSounds');
const googleSounds = require('./sounds/googleSounds');
const UserStorage = require('./userStorage');

const storage = new UserStorage();

const BASE_URL = 'https://s3.amazonaws.com/avadakedavra';

const handler = {
  LAUNCH() {
    registerGoogleAnalytics.call(this).event('Main flow', 'Session Start', { sc: 'start' });
    registerGoogleAnalytics.call(this).event('Main flow', 'Launch');

    this.user().data.afterEffectIndex = this.user().data.afterEffectIndex || 0;
    this.user().data.interjectionIndex = this.user().data.interjectionIndex || 0;
    this.user().data.spellIndex = this.user().data.spellIndex || 0;

    this
      .setSessionAttribute('startTime', +new Date())
      .toIntent('spellRequest', this.t('Spell.Launch'));
  },
  CAN_FULFILL_INTENT() {
    console.log(this.getHandlerPath());

    this.canFulfillRequest();
  },
  NextIntent() {
    registerGoogleAnalytics.call(this).event('Main flow', 'NextIntent');

    this.toIntent('spellRequest', this.t('Spell.Next'));
  },
  PreviousIntent() {
    registerGoogleAnalytics.call(this).event('Main flow', 'PreviousIntent');

    const spellIndex = this.user().data.spellIndex || 1;
    this.user().data.spellIndex = spellIndex - 1;
    this.toIntent('spellRequest', this.t('Spell.Previous'));
  },
  RepeatIntent() {
    if (this.getSessionAttribute('speechOutput')) {
      registerGoogleAnalytics.call(this).event('Main flow', 'RepeatIntent');
      this.ask(this.getSessionAttribute('speechOutput'), this.getSessionAttribute('repromptSpeech'));
    } else {
      registerGoogleAnalytics.call(this).event('Main flow', 'RepeatIntent at LaunchRequest');
      this.toIntent('LAUNCH');
    }
  },
  StartOverIntent() {
    registerGoogleAnalytics.call(this).event('Main flow', 'StartOverIntent');

    this.toIntent('spellRequest', this.t('Spell.StartOver'));
  },
  HelpIntent() {
    registerGoogleAnalytics.call(this).event('Main flow', 'HelpIntent');

    this
      .setSessionAttribute('speechOutput', this.t('Help.ask'))
      .setSessionAttribute('repromptSpeech', this.t('Help.reprompt'))
      .ask(this.getSessionAttribute('speechOutput'), this.getSessionAttribute('repromptSpeech'));
  },
  Unhandled() {
    this.toIntent('spellRequest', this.t('Spell.Unhandled'));
  },
  spellRequest(previousSpeechOutput) {
    registerGoogleAnalytics.call(this).event('Main flow', this.getIntentName());

    const interjectionsArray = this.t('Interjections');
    const afterEffectsArray = this.t('AfterEffects');
    const soundsArray = getSounds(this.isGoogleAction());

    let { afterEffectIndex, interjectionIndex, spellIndex } = this.user().data;
    let speechBuilder = this.speechBuilder();

    if (previousSpeechOutput) {
      speechBuilder = speechBuilder
        .addText(previousSpeechOutput)
        .addBreak('0.5s');
    }

    speechBuilder = speechBuilder
      .addAudio(soundsArray[spellIndex])
      .addBreak('0.5s');

    if (this.isAlexaSkill()) {
      speechBuilder = speechBuilder
        .addText(interjectionsArray[interjectionIndex])
        .addBreak('0.5s');

      this
        .alexaSkill()
        .showStandardCard(this.t('Spell.CardTitle'), '', {
          smallImageUrl: `${BASE_URL}/720x480.jpg`,
          largeImageUrl: `${BASE_URL}/1200x800.jpg`,
        });
    } else {
      this
        .googleAction()
        .showImageCard(this.t('Spell.CardTitle'), '****', `${BASE_URL}/720x480.jpg`)
        .showSuggestionChips(this.t('SuggestionChips'));
    }

    speechBuilder = speechBuilder
      .addText(afterEffectsArray[afterEffectIndex])
      .addBreak('0.5s');

    afterEffectIndex += 1;
    interjectionIndex += 1;
    spellIndex += 1;

    if (afterEffectIndex >= _.size(afterEffectsArray)) {
      afterEffectIndex = -1;
    }

    if (interjectionIndex >= _.size(interjectionsArray)) {
      interjectionIndex = -1;
    }

    if (spellIndex >= _.size(soundsArray)) {
      spellIndex = -1;
    }

    this.user().data.afterEffectIndex = afterEffectIndex + 1;
    this.user().data.interjectionIndex = interjectionIndex + 1;
    this.user().data.spellIndex = spellIndex + 1;

    speechBuilder = speechBuilder.addT('Spell.reprompt');

    this
      .setSessionAttribute('speechOutput', speechBuilder.build())
      .setSessionAttribute('repromptSpeech', this.t('Spell.reprompt'))
      .ask(this.getSessionAttribute('speechOutput'), this.getSessionAttribute('repromptSpeech'));
  },
  StopIntent() {
    // await storage.put(this.getSessionAttribute('user'));

    registerGoogleAnalytics.call(this).event('Main flow', 'StopIntent');
    endSession.call(this);

    this.tell(this.t('Exit'));
  },
  END() {
    // await storage.put(this.getSessionAttribute('user'));

    registerGoogleAnalytics.call(this).event('Main flow', 'SessionEnded');
    endSession.call(this);

    if (this.isGoogleAction()) {
      this.tell(this.t('Exit'));
    } else {
      this.respond();
    }
  },
};

function getSounds(isGoogleAction) {
  let sounds = _.concat(alexaSounds);

  if (isGoogleAction) {
    sounds = _.concat(sounds, googleSounds);
  }

  return sounds;
}

function endSession() {
  const start = this.getSessionAttribute('startTime');
  registerGoogleAnalytics.call(this).event('Main flow', 'Session End', { sc: 'end' });

  if (start) {
    const elapsed = +new Date() - start;
    registerGoogleAnalytics.call(this).timing('Main flow', 'Session Duration', elapsed);

    console.log('Session Duration', elapsed);
  }
}

function registerGoogleAnalytics() {
  if (!this.googleAnalytics) {
    const userID = this.getUserId();
    const trackingCode = config.googleAnalytics.trackingCode;

    this.googleAnalytics = universalAnalytics(trackingCode, userID, { strictCidFormat: false });
  }

  this.googleAnalytics.set('ul', this.getLocale().toLowerCase());
  this.googleAnalytics.set('cd1', this.getType());

  // Check for supportedInterfaces
  if (this.hasScreenInterface()) {
    this.googleAnalytics.set('cd2', true);
  }

  if (this.hasAudioInterface()) {
    this.googleAnalytics.set('cd3', true);
  }

  if (this.hasVideoInterface()) {
    this.googleAnalytics.set('cd4', true);
  }

  return this.googleAnalytics;
}

module.exports = handler;
