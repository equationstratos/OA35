# Brochage et configuration firmware

## STM32F722RET6 — affectation des broches

| Fonction | Port | Broche LQFP‑64 | Remarque |
|---|---|---|---|
| Buzzer | PC13 | 2 | pilote le grille du 2N7002, pastille `BZ-` |
| LED 0 | PC14 | 3 | LED verte D7, active à l'état bas |
| LED 1 | PC15 | 4 | LED verte D8, active à l'état bas |
| Quartz | PH0 / PH1 | 5 / 6 | 8 MHz, obligatoire pour l'USB |
| ADC batterie | PC1 | 9 | ADC1_IN11, pont 100 k / 10 k |
| ADC courant | PC2 | 10 | ADC1_IN12, INA186A3 |
| ADC RSSI | PC3 | 11 | ADC1_IN13, pastille `RSSI` |
| UART4 TX / RX | PA0 / PA1 | 14 / 15 | pastilles `TX4` / `RX4` |
| UART2 TX / RX | PA2 / PA3 | 16 / 17 | pastilles `TX2` / `RX2`, RX2 aussi sur le connecteur VTX |
| Gyro CS | PA4 | 20 | SPI1 |
| Gyro SCK / MISO / MOSI | PA5 / PA6 / PA7 | 21 / 22 / 23 | SPI1 |
| Gyro INT1 | PC4 | 24 | EXTI4 |
| Moteur 1 | PB0 | 26 | TIM3_CH3 |
| Moteur 2 | PB1 | 27 | TIM3_CH4 |
| Moteur 3 | PB4 | 56 | TIM3_CH1 |
| Moteur 4 | PB5 | 57 | TIM3_CH2 |
| UART6 TX / RX | PC6 / PC7 | 37 / 38 | pastilles `TX6` / `RX6` |
| Ruban de LED | PA8 | 41 | TIM1_CH1, pastille `LED` |
| UART1 TX / RX | PA9 / PA10 | 42 / 43 | connecteur VTX numérique et pastilles `TX1` / `RX1` |
| USB D− / D+ | PA11 / PA12 | 44 / 45 | via USBLC6‑2SC6 |
| SWDIO / SWCLK | PA13 / PA14 | 46 / 49 | pastilles TP1…TP6 |
| Flash CS | PA15 | 50 | SPI3 |
| Flash SCK / MISO / MOSI | PC10 / PC11 / PC12 | 51 / 52 / 53 | SPI3 |
| I2C1 SCL / SDA | PB6 / PB7 | 58 / 59 | baromètre BMP280 et pastilles `SCL` / `SDA` |
| BOOT0 | — | 60 | tiré au 0 V par 10 k, pastille TP4 |

Les quatre moteurs sont sur le même timer (TIM3), donc le DShot en mode
« burst » est possible. Broches libres, sorties sur rien : PC0, PC5, PB2,
PB10, PB12…PB15, PC8, PC9, PD2, PB3, PB8, PB9.

## Connecteur VTX numérique (J2, JST‑SH 6 points)

| Broche | Signal |
|---|---|
| 1 | GND |
| 2 | VBAT (tension batterie, après shunt) |
| 3 | UART1 TX (côté carte) |
| 4 | UART1 RX (côté carte) |
| 5 | UART2 RX — entrée SBUS |
| 6 | +5 V |

## Pastilles de câblage

Bord avant : `+5V`, `GND`, `RX2`, `TX2`, `+5V`, `GND`, `RX4`, `TX4`.
Côté droit : `RX6`, `TX6`, `RX1`, `TX1`, `LED`, `BZ-`, `BZ+`.
Côté gauche : `RSSI`, `SCL`, `SDA`, `+3V3`, `GND`, `VBAT`, `GND`.
Arrière : `BAT+`, `BAT-` (fil de batterie **et** condensateur de découplage),
et les douze pastilles moteur `M1A/B/C` … `M4A/B/C` dans les quatre coins.

## Pastilles de test du contrôleur de vol

Six pastilles sur la face du dessous, à gauche du micro :

| Pastille | Signal |
|---|---|
| TP1 | SWDIO |
| TP2 | SWCLK |
| TP3 | NRST |
| TP4 | BOOT0 |
| TP5 | +3,3 V |
| TP6 | GND |

Pour entrer en DFU sur une carte dont le firmware ne répond plus : relier
**TP4 à TP5** avec un fil court — les deux pastilles sont en diagonale, une
goutte d'étain ne suffit pas — brancher l'USB, puis retirer le pont. Le
STM32 démarre sur son bootloader USB et le configurateur Betaflight propose
« DFU ».

## Betaflight

Il n'existe pas de cible Betaflight pour cette carte ; partez d'une cible
unifiée F7X2 et appliquez le mapping ci‑dessous dans la CLI. Vérifiez chaque
ligne avant de sauvegarder, en particulier les options DMA, qui dépendent de
la version de Betaflight (`dma pin B00` liste les possibilités).

```
resource BEEPER 1 C13
resource LED 1 C14
resource LED 2 C15
resource MOTOR 1 B00
resource MOTOR 2 B01
resource MOTOR 3 B04
resource MOTOR 4 B05
resource LED_STRIP 1 A08
resource SERIAL_TX 1 A09
resource SERIAL_RX 1 A10
resource SERIAL_TX 2 A02
resource SERIAL_RX 2 A03
resource SERIAL_TX 4 A00
resource SERIAL_RX 4 A01
resource SERIAL_TX 6 C06
resource SERIAL_RX 6 C07
resource I2C_SCL 1 B06
resource I2C_SDA 1 B07
resource SPI_SCK 1 A05
resource SPI_MISO 1 A06
resource SPI_MOSI 1 A07
resource SPI_SCK 3 C10
resource SPI_MISO 3 C11
resource SPI_MOSI 3 C12
resource GYRO_CS 1 A04
resource GYRO_EXTI 1 C04
resource FLASH_CS 1 A15
resource ADC_BATT 1 C01
resource ADC_CURR 1 C02
resource ADC_RSSI 1 C03

timer B00 AF2
timer B01 AF2
timer B04 AF2
timer B05 AF2
timer A08 AF1

set gyro_1_bustype = SPI
set gyro_1_spibus = 1
set gyro_1_sensor_align = CW0
set baro_bustype = I2C
set baro_i2c_device = 1
set baro_hardware = BMP280
set blackbox_device = SPIFLASH
set flash_spi_bus = 3
set vbat_scale = 110
set current_meter = ADC
set ibata_scale = 200
set ibata_offset = 0
save
```

`vbat_scale = 110` correspond au pont 100 k / 10 k. `ibata_scale = 200`
correspond aux 20 mV/A du shunt 0,2 mΩ avec l'INA186A3 (gain 100 V/V) ;
l'unité Betaflight est le dixième de mV par ampère. Recalibrez les deux avec
un multimètre après le premier vol stationnaire.

L'alignement du gyroscope (`gyro_1_sensor_align`) dépend de l'orientation de
la carte dans le châssis : relevez‑le dans le configurateur plutôt que de le
recopier.

## AM32 sur les quatre ESC

Chaque canal est un AT32F421G8U7 indépendant, à flasher séparément. Les
cartes sortent d'usine vierges : JLCPCB ne programme pas les composants.

1. Alimentez la carte en 5 V par l'USB (le rail 3,3 V des ESC vient du rail
   de grille, donc il faut la batterie pour flasher — branchez une batterie
   3S sur `BAT+` / `BAT-`, hélices démontées).
2. Reliez une sonde SWD (ST‑Link, DAPLink) à `TP7`/`TP8` pour le canal 1,
   `TP9`/`TP10` pour le canal 2, `TP11`/`TP12` pour le canal 3,
   `TP13`/`TP14` pour le canal 4. La première pastille de chaque paire est
   SWDIO, la seconde SWCLK. La masse se prend sur une pastille `GND`.
3. Écrivez le bootloader AM32 pour AT32F421, puis le firmware via
   [am32.ca](https://am32.ca) ou le configurateur AM32.
4. La télémétrie remonte par DShot bidirectionnel sur la ligne de signal ;
   il n'y a pas de fil de télémétrie séparé.
