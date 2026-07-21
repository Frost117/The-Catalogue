// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'

export default withNuxt(
  pluginVueA11y.configs['flat/recommended']
)
