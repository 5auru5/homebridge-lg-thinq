import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {Device} from '../lib/Device';
import {baseDevice} from '../baseDevice';

enum RotateSpeed {
  AUTO = 8,
  LOW = 2,
  MEDIUM = 4,
  HIGH = 6,
  EXTRA = 7,
}

export default class AirPurifier extends baseDevice {
  protected serviceAirPurifier: Service;
  protected serviceHumiditySensor: Service;
  protected serviceAirQuanlity: Service;
  protected serviceLight: Service;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        AirPurifier,
        AirQualitySensor,
        HumiditySensor,
        Lightbulb,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    this.serviceAirPurifier = accessory.getService(AirPurifier) || accessory.addService(AirPurifier, 'Air Purifier');

    /**
     * Required Characteristics: Active, CurrentAirPurifierState, TargetAirPurifierState
     */
    this.serviceAirPurifier.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this));

    this.serviceAirPurifier.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onGet(() => {
        return Characteristic.TargetAirPurifierState.AUTO;
      })
      .onSet(this.setTargetAirPurifierState.bind(this));

    /**
     * Optional Characteristics: Name, RotationSpeed, SwingMode
     */
    this.serviceAirPurifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceAirPurifier.getCharacteristic(Characteristic.SwingMode).onSet(this.setSwingMode.bind(this));

    this.serviceHumiditySensor = accessory.getService(HumiditySensor) || accessory.addService(HumiditySensor);
    const humidityValue = device.data.snapshot['airState.humidity.current'] || 0;
    this.serviceHumiditySensor.setCharacteristic(Characteristic.CurrentRelativeHumidity, humidityValue);

    this.serviceAirQuanlity = accessory.getService(AirQualitySensor) || accessory.addService(AirQualitySensor);
    this.serviceAirQuanlity.setCharacteristic(Characteristic.AirQuality, parseInt(device.data.snapshot['airState.quality.overall']));
    this.serviceAirQuanlity.setCharacteristic(Characteristic.PM2_5Density, parseInt(device.data.snapshot['airState.quality.PM2']) || 0);
    this.serviceAirQuanlity.setCharacteristic(Characteristic.PM10Density, parseInt(device.data.snapshot['airState.quality.PM10']) || 0);

    this.serviceLight = new Lightbulb('Light');
    this.serviceLight.getCharacteristic(Characteristic.On).onSet(this.setLight.bind(this));
    this.serviceLight.addLinkedService(this.serviceAirPurifier);

    this.updateAccessoryCharacteristic(device);
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn,
    });
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    this.platform.log.debug('Set Target State ->', value);
  }

  async setRotationSpeed(value: CharacteristicValue) {
    this.platform.log.debug('Set Rotation Speed ->', value);
    const device: Device = this.accessory.context.device;
    const values = [RotateSpeed.AUTO, RotateSpeed.LOW, RotateSpeed.MEDIUM, RotateSpeed.HIGH, RotateSpeed.EXTRA];
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: values[value as number] || RotateSpeed.AUTO,
    });
  }

  async setSwingMode(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isSwing = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.circulate.rotate',
      dataValue: isSwing,
    });
    device.data.snapshot['airState.circulate.rotate'] = isSwing;
    this.updateAccessoryCharacteristic(device);
  }

  async setLight(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isLightOn = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.lightingState.signal',
      dataValue: isLightOn,
    });
    device.data.snapshot['airState.lightingState.signal'] = isLightOn;
    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const {
      Characteristic,
    } = this.platform;

    const active = device.data.snapshot['airState.operation'] as boolean;
    this.serviceAirPurifier.updateCharacteristic(Characteristic.Active, active?Characteristic.Active.ACTIVE:Characteristic.Active.INACTIVE);

    const currentState = active ? Characteristic.CurrentAirPurifierState.PURIFYING_AIR : Characteristic.CurrentAirPurifierState.INACTIVE;
    this.serviceAirPurifier.updateCharacteristic(Characteristic.CurrentAirPurifierState, currentState);

    /*const values = [RotateSpeed.AUTO, RotateSpeed.LOW, RotateSpeed.MEDIUM, RotateSpeed.HIGH, RotateSpeed.EXTRA];
    const rotateSpeed = values.indexOf(device.data.snapshot['airState.windStrength'] || RotateSpeed.AUTO);
    serviceAirPurifier?.updateCharacteristic(Characteristic.RotationSpeed, rotateSpeed);*/

    const rotate = (device.data.snapshot['airState.circulate.rotate'] || 0) as boolean;
    const swingMode = rotate ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED;
    this.serviceAirPurifier.updateCharacteristic(Characteristic.SwingMode, swingMode);

    this.serviceAirQuanlity.updateCharacteristic(Characteristic.AirQuality, parseInt(device.data.snapshot['airState.quality.overall']));
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM2_5Density, parseInt(device.data.snapshot['airState.quality.PM2']) || 0);
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM10Density, parseInt(device.data.snapshot['airState.quality.PM10']) || 0);

    this.serviceLight.updateCharacteristic(Characteristic.On, active && (device.data.snapshot['airState.lightingState.signal'] as boolean));
    this.serviceLight.setHiddenService(!active);

    const humidityValue = device.data.snapshot['airState.humidity.current'] || 0;
    this.serviceHumiditySensor.setCharacteristic(Characteristic.CurrentRelativeHumidity, humidityValue);
  }
}