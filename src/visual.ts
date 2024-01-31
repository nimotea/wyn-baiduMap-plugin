import "../style/visual.less";

import gcoord from "gcoord";

import { gcoordType } from "./coordinates";
import { OPTIONKEY } from "./optionKey";
import "bmapgllibs";
// import "./AreaRestriction_min.js";
import {
  debounce,
  debounceTime,
  filter,
  fromEvent,
  map,
  merge,
  switchMap,
  take,
  tap,
} from "rxjs";
import markerImage from "../assets/marker_red.png";

export default class Visual extends WynVisual {
  private static root: Visual;
  private plainDataView: any;
  private host: VisualNS.VisualHost;
  private selectionManager: VisualNS.SelectionManager;
  private dom: HTMLDivElement;
  private container: HTMLDivElement;
  private map: BMapGL.Map;
  private _lngKey: string;
  private _latKey: string;
  private properties: any;
  private points: BMapGL.Point[] = [];
  private markers: BMapGL.Marker[] = [];
  private circles: BMapGL.Circle[] = [];
  private monitorMarkers: BMapGL.Marker[] = [];

  private minLng: number = 999;
  private minLat: number = 999;
  private maxLng: number = -999;
  private maxLat: number = -999;
  private HugeIcon: BMapGL.Icon = new BMapGL.Icon(
    markerImage,
    new BMapGL.Size(30, 30)
  );
  private NormalIcon: BMapGL.Icon = new BMapGL.Icon(
    markerImage,
    new BMapGL.Size(23, 25)
  );

  constructor(
    dom: HTMLDivElement,
    host: VisualNS.VisualHost,
    options: VisualNS.IVisualUpdateOptions
  ) {
    super(dom, host, options);
    Visual.root = this;
    window.parent.oncontextmenu=function(e){    //取消默认的浏览器自带右键 很重要！！    
      e.preventDefault();
    }

    this.dom = dom;
    this.host = host;
    this.properties = options.properties;
    this.selectionManager = host.selectionService.createSelectionManager();
    this.container = document.createElement("div");
    this.container.id = "container";
    this.dom.append(this.container);
    this.map = new BMapGL.Map(this.container);
    /* this.map.centerAndZoom(
      this.properties[OPTIONKEY.CENTER_LOCATION],
      this.properties[OPTIONKEY.ZOOM_LEVE]
    ); */
    if (this.properties[OPTIONKEY.ZOOM_ENABLE]) {
      this.map.enableScrollWheelZoom();
    } else {
      this.map.disableScrollWheelZoom();
    }
    var scaleCtrl = new BMapGL.ScaleControl();
    var zoomCtrl = new BMapGL.ZoomControl();
    this.map.addControl(scaleCtrl);
    this.map.addControl(zoomCtrl);
    fromEvent(this.map, "mousedown").subscribe((pointer) => {
      this.selectionManager.clear();
      this.markers.forEach((marker) => {
        marker.setIcon(this.NormalIcon);
      });
    });
  }

  private addPoint(dataView: any) {
    this.markers = [];
    this.points = [];
    // use gcoord translate data
    dataView.map((item) => {
      let point = gcoord.transform(
        [item[this._lngKey], item[this._latKey]],
        gcoordType(this.properties[OPTIONKEY.COORDINATES]),
        gcoord.BD09
      );

      // find boundary point
      if (point[0] > this.maxLng) {
        this.maxLng = point[0];
      }
      if (point[0] < this.minLng) {
        this.minLng = point[0];
      }

      if (point[1] > this.maxLat) {
        this.maxLat = point[1];
      }
      if (point[1] < this.minLat) {
        this.minLat = point[1];
      }
      let mapPoint = new BMapGL.Point(point[0], point[1]);

      let marker = new BMapGL.Marker(mapPoint, {
        icon: this.NormalIcon,
      });

      this.points.push(mapPoint);
      this.markers.push(marker);
      fromEvent(marker, "mouseover")
        .pipe(debounceTime(100))
        .subscribe((pointer) => {
          this.host.toolTipService.show({
            position: {
              x: pointer.clientX,
              y: pointer.clientY,
            },
            fields: Object.entries<string>(item).map(([key, value]) => ({
              label: key,
              value: value,
            })),
            _smooth: true,
            customTooltipContent:
              this.plainDataView.profile.tooltip.options.tooltipContentSetting,
          });
        });

      fromEvent(marker, "mouseout")
        .pipe(debounceTime(100))
        .subscribe((pointer) => {
          this.host.toolTipService.hide();
        });

      let mouseDown$ = fromEvent(marker, "mousedown");
      mouseDown$
        .pipe(
          tap(e => {e.domEvent.stopPropagation();}),
          map((event) => ({
            domEvent: event.domEvent,
            button: event.domEvent.button,
            type: event.domEvent.type,
          })),
          filter((event) => event.button === 0), //左键处理逻辑
          tap((e) => {
            e.domEvent.stopPropagation();
            this.markers.forEach((marker) => {
              marker.setIcon(this.NormalIcon);
            });
            marker.setIcon(this.HugeIcon);
            this.selectionManager.clear();
            this.host.contextMenuService.hide();
            const selectionId = this.host.selectionService.createSelectionId();
            this.plainDataView.profile.tooltip.values.map((pro) => {
              selectionId.withMeasure(pro, item);
            });
            this.plainDataView.profile.category.values.map((pro) => {
              selectionId.withDimension(pro, item);
            });
            this.selectionManager.select(selectionId, true);
          }),
          switchMap(() =>
          mouseDown$.pipe(
              filter((event) => event.domEvent.button === 2),
              take(1)
            )
          )
        )
        .subscribe((event) => { // 右键处理逻辑
          this.host.contextMenuService.show({
            position: {
              x: event.clientX,
              y: event.clientY,
            },
          });
        });
    });
  }

  private updatePointLayer() {
    this.map.clearOverlays();
    this.markers.forEach((marker) => {
      this.map.addOverlay(marker);
    });
  }

  private adjustBBox() {
    const view = this.map.getViewport(this.points); //获取最佳视角
    const zoom = view.zoom; //获取最佳视角的缩放层级
    const centerPoint = view.center; //获取最佳视角的中心点
    this.map.centerAndZoom(centerPoint, zoom);
  }

  public update(options: VisualNS.IVisualUpdateOptions) {
    const plainDataView = options.dataViews[0] && options.dataViews[0].plain;
    this.properties = options.properties;
    this.plainDataView = plainDataView;
    if (
      plainDataView &&
      plainDataView.profile.category.values.length != 0 &&
      plainDataView.profile.longitude.values.length != 0 &&
      plainDataView.profile.latitude.values.length != 0
    ) {
      this._lngKey = plainDataView.profile.longitude.values[0].display;
      this._latKey = plainDataView.profile.latitude.values[0].display;
      this.addPoint(plainDataView.data);
      this.adjustBBox();
      this.updatePointLayer();
    } else {
      this.map.clearOverlays();
      this.map.centerAndZoom(
        this.properties[OPTIONKEY.CENTER_LOCATION],
        this.properties[OPTIONKEY.ZOOM_LEVE]
      );
    }
    this.addMonitorArea();
  }

  private addMonitorArea() {
    this.monitorMarkers = [];
    this.circles = [];
    this.monitorMarkers = this.properties[OPTIONKEY.CUSTOME_POINT].map(
      (monitor) => {
        let monitorMarker: BMapGL.Marker;
        if (
          monitor[OPTIONKEY.CUSTOME_LAT] &&
          monitor[OPTIONKEY.CUSTOME_LNG] &&
          monitor[OPTIONKEY.CUSTOME_COORDINATES] &&
          monitor[OPTIONKEY.CUSTOME_IMAGE]
        ) {
          let point = gcoord.transform(
            [monitor[OPTIONKEY.CUSTOME_LNG], monitor[OPTIONKEY.CUSTOME_LAT]],
            gcoordType(monitor[OPTIONKEY.CUSTOME_COORDINATES]),
            gcoord.BD09
          );
          let mapPoint = new BMapGL.Point(point[0], point[1]);
          monitorMarker = new BMapGL.Marker(mapPoint);
          let Icon = new BMapGL.Icon(
            monitor[OPTIONKEY.CUSTOME_IMAGE],
            new BMapGL.Size(50, 50)
          );
          monitorMarker.setIcon(Icon);
          // make a monitor point label
          var opts = {
            width: 100,
            height: 100,
            title: monitor[OPTIONKEY.CUSTOME_POINT_NAME],
          };
          var infoWindow = new BMapGL.InfoWindow("", opts);
          fromEvent(monitorMarker, "click")
            .pipe(
              tap((e) => {
                e.domEvent.stopPropagation();
              })
            )
            .subscribe((pointer) => {
              this.map.openInfoWindow(infoWindow, mapPoint); // 开启信息窗口
            });

          let circle = new BMapGL.Circle(
            mapPoint,
            monitor[OPTIONKEY.CUSTOM_RADIUS]
          );
          if (this.CalculateWarning(circle)) {
            circle.setFillColor(monitor[OPTIONKEY.CUSTOM_WARN_COLOR]);
            circle.setStrokeColor(monitor[OPTIONKEY.CUSTOM_WARN_COLOR]);
          } else {
            circle.setFillColor(monitor[OPTIONKEY.CUSTOM_NORMAL_COLOR]);
            circle.setStrokeColor(monitor[OPTIONKEY.CUSTOM_NORMAL_COLOR]);
          }
          this.circles.push(circle);
        }
        return monitorMarker;
      }
    );
    this.monitorMarkers.map((marker) => {
      this.map.addOverlay(marker);
    });
    this.circles.map((circle) => {
      this.map.addOverlay(circle);
    });
  }

  private CalculateWarning(circle: BMapGL.Circle) {
    let isWarnStatus = false;
    this.points.some((point) => {
      if (
        this.map.getDistance(circle.getCenter(), point) <= circle.getRadius()
      ) {
        isWarnStatus = true;
        return true;
      }
      return false;
    });
    return isWarnStatus;
  }

  public onDestroy(): void {}

  public getInspectorHiddenState(
    options: VisualNS.IVisualUpdateOptions
  ): string[] {
    return null;
  }

  public getActionBarHiddenState(
    options: VisualNS.IVisualUpdateOptions
  ): string[] {
    return null;
  }

  public getColorAssignmentConfigMapping(
    dataViews: VisualNS.IDataView[]
  ): VisualNS.IColorAssignmentConfigMapping {
    return null;
  }
}
