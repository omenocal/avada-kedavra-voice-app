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
  async LAUNCH() {
    registerGoogleAnalytics.call(this).event('Main flow', 'Session Start', { sc: 'start' });
    registerGoogleAnalytics.call(this).event('Main flow', 'Launch');

    let name;
    let user = await storage.get(this.getUserId());
    const firstTimeLabel = user ? '' : 'FirstTime';

    user = user || { userId: this.getUserId() };

    if (this.isAlexaSkill()) {
      try {
        name = await this.user().getGivenName();
      } catch (err) {
        this.alexaSkill().showAskForContactPermissionCard('given_name');
      }
    }

    user.afterEffectIndex = user.afterEffectIndex || 0;
    user.interjectionIndex = user.interjectionIndex || 0;
    user.spellIndex = user.spellIndex || 0;

    this
      .setSessionAttribute('user', user)
      .setSessionAttribute('startTime', +new Date())
      .toIntent('spellRequest', this.t(`Spell.Launch${firstTimeLabel}`, { name }));
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

    let spellIndex = this.getSessionAttribute('user.spellIndex') || 1;
    spellIndex -= 1;

    this
      .setSessionAttribute('user.spellIndex', spellIndex)
      .toIntent('spellRequest', this.t('Spell.Previous'));
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
    const user = this.getSessionAttribute('user');

    let {
      afterEffectIndex,
      afterEffectIdArray,
      interjectionIndex,
      spellIndex,
      soundIdArray,
    } = user;

    let speechBuilder = this.speechBuilder();
    const afterEffectsSize = _.size(afterEffectsArray);
    const soundSize = _.size(soundsArray);

    if (_.size(afterEffectIdArray) !== afterEffectsSize) {
      afterEffectIdArray = _.shuffle(_.range(afterEffectsSize));
    }

    if (_.size(soundIdArray) !== soundSize) {
      soundIdArray = _.shuffle(_.range(soundSize));
    }

    user.afterEffectIdArray = afterEffectIdArray;
    user.soundIdArray = soundIdArray;

    if (previousSpeechOutput) {
      speechBuilder = speechBuilder
        .addText(previousSpeechOutput)
        .addText('.')
        .addBreak('0.5s');
    }

    speechBuilder = speechBuilder
      .addAudio(soundsArray[soundIdArray[spellIndex]], '')
      .addBreak('0.5s');

    if (this.isAlexaSkill()) {
      speechBuilder = speechBuilder
        .addText(interjectionsArray[interjectionIndex])
        .addBreak('0.5s')
        .addText('.');

      const bodyTemplate = this.alexaSkill().templateBuilder('BodyTemplate1');
      bodyTemplate
        .setToken('token')
        .setBackButton('HIDDEN')
        .setTitle(this.t('Spell.CardTitle'))
        .setBackgroundImage({
          description: this.t('Spell.CardTitle'),
          url: `${BASE_URL}/1024x600.jpg`,
        });

      this
        .alexaSkill()
        .showStandardCard(this.t('Spell.CardTitle'), '\u200C', {
          smallImageUrl: `${BASE_URL}/720x480.jpg`,
          largeImageUrl: `${BASE_URL}/1200x800.jpg`,
        })
        .showDisplayTemplate(bodyTemplate);
    } else {
      this
        .googleAction()
        .showImageCard(this.t('Spell.CardTitle'), '\u200C', `${BASE_URL}/720x480.jpg`)
        .showSuggestionChips(this.t('SuggestionChips'));
    }

    const moderated = `<emphasis level="moderate">${afterEffectsArray[afterEffectIdArray[afterEffectIndex]]}</emphasis>`;

    speechBuilder = speechBuilder
      .addText(moderated)
      .addText('.')
      .addBreak('0.5s');

    afterEffectIndex += 1;
    interjectionIndex += 1;
    spellIndex += 1;

    if (afterEffectIndex >= _.size(afterEffectsArray)) {
      afterEffectIndex = 0;
    }

    if (interjectionIndex >= _.size(interjectionsArray)) {
      interjectionIndex = 0;
    }

    if (spellIndex >= _.size(soundsArray)) {
      spellIndex = 0;
    }

    user.afterEffectIndex = afterEffectIndex;
    user.interjectionIndex = interjectionIndex;
    user.spellIndex = spellIndex;

    speechBuilder = speechBuilder.addT('Spell.reprompt');

    this
      .setSessionAttribute('user', user)
      .setSessionAttribute('speechOutput', speechBuilder.build())
      .setSessionAttribute('repromptSpeech', this.t('Spell.reprompt'))
      .ask(this.getSessionAttribute('speechOutput'), this.getSessionAttribute('repromptSpeech'));
  },
  async StopIntent() {
    await storage.put(this.getSessionAttribute('user'));

    registerGoogleAnalytics.call(this).event('Main flow', 'StopIntent');
    endSession.call(this);

    this.tell(this.t('Exit'));
  },
  async END() {
    await storage.put(this.getSessionAttribute('user'));

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
  let sounds = [];

  if (isGoogleAction) {
    sounds = _.concat(sounds, googleSounds);
  } else {
    sounds = _.concat(sounds, alexaSounds);
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
