/** @jsx jsx */
import { classNames, css, hooks, jsx, polished } from "jimu-core";
import {
  SettingRow,
  SettingSection,
} from "jimu-ui/advanced/setting-components";
import { Button, Icon } from "jimu-ui";
import type { SettingChangeFunction } from "jimu-for-builder";
import { StyleVariant } from "../../config/enums";
import type { IMSearchConfig } from "../../config/types";
import defaultMessages from "../translations/default";

interface StyleVariantSelectorProps {
  id: string;
  onSettingChange: SettingChangeFunction;
  config: IMSearchConfig;
  currentVariant: StyleVariant;
}

const StyleVariantSelector = (props: StyleVariantSelectorProps) => {
  const STYLE = css`
    .active {
      .style-img {
        border: 2px solid var(--sys-color-primary-light);
      }
    }
    .style-img {
      border: 2px solid transparent;
      height: ${polished.rem(36)} !important;
      margin: 0;
    }
    .arrangement {
      margin: 0;
      height: auto;
      background: #181818;
    }
    .arrangement-mt {
      margin-top: ${polished.rem(12)};
    }
    & button {
      width: ${polished.rem(108)};
      height: ${polished.rem(80)};
      padding: 0;
    }
  `;

  const translate = hooks.useTranslation(defaultMessages);
  const { config, id, onSettingChange, currentVariant } = props;

  const handleStyleVariantChange = hooks.useEventCallback(
    (variant: StyleVariant) => {
      onSettingChange({
        id: id,
        config: config.set("styleVariant", variant),
      });
    }
  );

  return (
    <SettingSection title={translate("settingStyleVariant")} css={STYLE}>
      <SettingRow>
        <div aria-label={translate("settingStyleVariant")} role="radiogroup">
          <Button
            type="tertiary"
            role="radio"
            className={classNames("w-100 arrangement", {
              active: currentVariant === StyleVariant.Default,
            })}
            onClick={() => {
              handleStyleVariantChange(StyleVariant.Default);
            }}
            title={translate("styleVariantDefault")}
            aria-label={translate("styleVariantDefault")}
            aria-checked={currentVariant === StyleVariant.Default}
          >
            <Icon
              className="style-img w-100 h-100"
              icon={require("../../assets/img/arrangement1.png")}
            />
          </Button>
          <Button
            type="tertiary"
            role="radio"
            className={classNames("w-100 arrangement arrangement-mt", {
              active: currentVariant === StyleVariant.Linear,
            })}
            onClick={() => {
              handleStyleVariantChange(StyleVariant.Linear);
            }}
            title={translate("styleVariantLinear")}
            aria-label={translate("styleVariantLinear")}
            aria-checked={currentVariant === StyleVariant.Linear}
          >
            <Icon
              className="style-img w-100 h-100"
              icon={require("../../assets/img/arrangement3.png")}
            />
          </Button>
        </div>
      </SettingRow>
    </SettingSection>
  );
};

export default StyleVariantSelector;
