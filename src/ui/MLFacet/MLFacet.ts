import { difference } from 'underscore';
import { $$ } from '../../utils/Dom';
import { exportGlobally } from '../../GlobalExports';
import { Component } from '../Base/Component';
import { IComponentBindings } from '../Base/ComponentBindings';
import { ComponentOptions } from '../Base/ComponentOptions';
import { Initialization } from '../Base/Initialization';
import { ResponsiveFacetOptions } from '../ResponsiveComponents/ResponsiveFacetOptions';
import { ResponsiveFacets } from '../ResponsiveComponents/ResponsiveFacets';
import { MLFacetHeader } from './MLFacetHeader/MLFacetHeader';
import { IMLFacetOptions, MLFacetOptions } from './MLFacetOptions';
import { IMLFacetValue } from './MLFacetValues/MLFacetValue';
import { MLFacetValues } from './MLFacetValues/MLFacetValues';
import { QueryEvents, IQuerySuccessEventArgs, IDoneBuildingQueryEventArgs } from '../../events/QueryEvents';
import { QueryStateModel } from '../../models/QueryStateModel';
import { Utils } from '../../utils/Utils';
import { MODEL_EVENTS, IAttributesChangedEventArg } from '../../models/Model';
import { Assert } from '../../misc/Assert';

export class MLFacet extends Component {
  static ID = 'MLFacet';
  static doExport = () => exportGlobally({ MLFacet });
  static options: IMLFacetOptions = { ...MLFacetOptions, ...ResponsiveFacetOptions };

  private includedAttributeId: string;
  private listenToQueryStateChange = true;
  private header: MLFacetHeader;
  private values: MLFacetValues;
  // TODO: remove
  private mockedSavedValues: IMLFacetValue[];

  constructor(public element: HTMLElement, public options?: IMLFacetOptions, bindings?: IComponentBindings) {
    super(element, MLFacet.ID, bindings);
    this.options = ComponentOptions.initComponentOptions(element, MLFacet, options);

    this.initQueryEvents();
    this.initQueryStateEvents();

    this.values = new MLFacetValues(this);

    ResponsiveFacets.init(this.root, this, this.options);
  }

  /**
   * Selects a single value.
   *
   * Does not trigger a query automatically.
   * Does not update the visual of the facet until a query is performed.
   *
   * @param value is a string.
   */
  public selectValue(value: string) {
    Assert.exists(value);
    this.selectMultipleValues([value]);
  }

  /**
   * Selects multiple values.
   *
   * Does not trigger a query automatically.
   * Does not update the visual of the facet until a query is performed.
   *
   * @param values is an array of strings.
   */
  public selectMultipleValues(values: string[]) {
    Assert.exists(values);
    this.ensureDom();
    values.forEach(value => {
      this.logger.info('Selecting facet value', this.values.get(value).select());
    });
    this.handleFacetValuesChanged();
  }

  /**
   * Deselects a single value.
   *
   * Does not trigger a query automatically.
   * Does not update the visual of the facet until a query is performed.
   *
   * @param values is a string.
   */
  public deselectValue(value: string) {
    Assert.exists(value);
    this.deselectMultipleValues([value]);
  }

  /**
   * Deselects multiple values.
   *
   * Does not trigger a query automatically.
   * Does not update the visual of the facet until a query is performed.
   *
   * @param values is an array of strings.
   */
  public deselectMultipleValues(values: string[]) {
    Assert.exists(values);
    this.ensureDom();
    values.forEach(value => {
      this.logger.info('Deselecting facet value', this.values.get(value).deselect());
    });
    this.handleFacetValuesChanged();
  }

  /**
   * Toggles the selection state of a single value (selects the value if it is not already selected; un-selects the
   * value if it is already selected).
   *
   * Does not trigger a query automatically.
   * @param values is a string.
   */
  public toggleSelectValue(value: string): void {
    Assert.exists(value);
    this.ensureDom();
    this.logger.info('Toggle select facet value', this.values.get(value).toggleSelect());
    this.handleFacetValuesChanged();
  }

  /**
   * Resets the facet by deselecting all values.
   *
   * Does not trigger a query automatically.
   * Updates the visual of the facet.
   *
   */
  public reset() {
    this.ensureDom();
    this.values.clearAll();
    this.values.render();
    this.updateAppearance();
    this.updateQueryStateModel();
  }

  private initQueryEvents() {
    this.bind.onRootElement(QueryEvents.duringQuery, () => this.ensureDom());
    this.bind.onRootElement(QueryEvents.doneBuildingQuery, (data: IDoneBuildingQueryEventArgs) => this.handleDoneBuildingQuery(data));
    this.bind.onRootElement(QueryEvents.querySuccess, (data: IQuerySuccessEventArgs) => this.handleQuerySuccess(data));
    this.bind.onRootElement(QueryEvents.queryError, () => this.onQueryResponse([]));
  }

  private initQueryStateEvents() {
    this.includedAttributeId = QueryStateModel.getFacetId(this.options.id);
    this.queryStateModel.registerNewAttribute(this.includedAttributeId, []);
    this.bind.onQueryState(MODEL_EVENTS.CHANGE, undefined, this.handleQueryStateChanged);
  }

  private handleDoneBuildingQuery(data: IDoneBuildingQueryEventArgs) {
    // TODO: add facets attribute to the query here
    // TODO: remove update of the mock
    if (!this.mockedSavedValues) {
      this.mockedSavedValues = [
        { value: 'test 1', selected: false, numberOfResults: 847324 },
        { value: 'test 2', selected: false, numberOfResults: 1 },
        { value: 'test 3', selected: false, numberOfResults: 13 },
        { value: 'test 4', selected: false, numberOfResults: 13134 },
        { value: 'test 5', selected: false, numberOfResults: 2223 }
      ] as IMLFacetValue[];
      return;
    }

    this.mockedSavedValues = this.values.allFacetValues;
  }

  private handleQuerySuccess(data: IQuerySuccessEventArgs) {
    // TODO: mock response elsewhere
    data.results.facets = this.mockedSavedValues;

    if (Utils.isNullOrUndefined(data.results.facets)) {
      return this.notImplementedError();
    }

    this.onQueryResponse(data.results.facets);
  }

  private handleQueryStateChanged(data: IAttributesChangedEventArg) {
    if (!this.listenToQueryStateChange) {
      return;
    }

    const querySelectedValues: string[] = data.attributes[this.includedAttributeId];
    if (!querySelectedValues) {
      return;
    }

    this.handleQueryStateChangedIncluded(querySelectedValues);
  }

  private handleQueryStateChangedIncluded = (querySelectedValues: string[]) => {
    const currentSelectedValues = this.values.selectedValues;
    const valuesToDeselect = difference(currentSelectedValues, querySelectedValues);
    if (Utils.isNonEmptyArray(valuesToDeselect)) {
      this.deselectMultipleValues(valuesToDeselect);
    }
    if (!Utils.arrayEqual(currentSelectedValues, querySelectedValues, false)) {
      this.selectMultipleValues(querySelectedValues);
    }
  };

  public createDom() {
    this.createContent();
    this.updateAppearance();
  }

  private createContent() {
    this.header = this.createHeader();
    this.element.appendChild(this.header.element);
    this.element.appendChild(this.values.render());
  }

  private createHeader() {
    return new MLFacetHeader(this);
  }

  private handleFacetValuesChanged() {
    this.updateQueryStateModel();
  }

  protected updateQueryStateModel() {
    this.listenToQueryStateChange = false;
    this.updateIncludedQueryStateModel();
    this.listenToQueryStateChange = true;
  }

  private updateIncludedQueryStateModel() {
    this.queryStateModel.set(this.includedAttributeId, this.values.selectedValues);
  }

  private updateAppearance() {
    this.header.toggleClear(this.values.hasSelectedValues());
    $$(this.element).toggleClass('coveo-active', this.values.hasSelectedValues());
    $$(this.element).toggleClass('coveo-facet-empty', this.values.isEmpty());
  }

  public triggerNewQuery() {
    this.beforeSendingQuery();
    this.queryController.executeQuery();
  }

  private beforeSendingQuery() {
    this.header.showLoading();
    this.updateAppearance();
  }

  private onQueryResponse(values: IMLFacetValue[]) {
    this.header.hideLoading();
    this.values.createFromResults(values);
    this.values.render();
    this.updateAppearance();
  }

  private notImplementedError() {
    this.logger.error('MLFacets are not supported by your current search endpoint. Disabling this component.');
    this.disable();
  }
}

Initialization.registerAutoCreateComponent(MLFacet);
MLFacet.doExport();